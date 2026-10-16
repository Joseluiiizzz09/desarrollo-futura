const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const Baileys = require('baileys');
const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = Baileys;
const downloadMediaMessage = Baileys.downloadMediaMessage;
require('./env');
const MultiAgentServer = require('./server');

// La libreria libsignal (dependencia interna de Baileys) hace console.info/warn
// con el objeto de sesion Signal completo, incluyendo claves privadas en texto
// plano, cada vez que rota una sesion (comportamiento normal, no error). Eso no
// debe quedar en los logs del servidor. Se filtra por prefijo, todo lo demas
// sigue pasando normal.
const rawConsoleInfo = console.info.bind(console);
const rawConsoleWarn = console.warn.bind(console);
console.info = (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('Closing session')) return;
    rawConsoleInfo(...args);
};
console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('Session already closed')) return;
    rawConsoleWarn(...args);
};

const DATA_DIR = path.join(__dirname, '..', 'data');
const TABS_FILE = path.join(DATA_DIR, 'web-tabs.json');
const AUTH_DIR = path.join(DATA_DIR, 'baileys-auth');
const CHATS_FILE = path.join(DATA_DIR, 'baileys-chats.json'); // formato antiguo (un solo archivo); solo se lee para migrar
// Un archivo por cuenta: guardar una cuenta ya no reescribe (ni congela el proceso
// serializando) el historial de las demas. Con 20 cuentas el archivo unico crecia
// sin limite y cada guardado bloqueaba todo el servicio.
const ALIAS_CAMPANAS_FILE = path.join(DATA_DIR, 'campanas-alias.json'); // linea de WhatsApp -> nombre de campana en Krono
const APAGAR_BIENVENIDA_FILE = path.join(DATA_DIR, 'auto-bienvenida.off');
const DESVINCULADAS_FILE = path.join(DATA_DIR, 'desvinculadas.json'); // lineas que se desvincularon solas (alerta para Jefatura) // si existe este archivo, la bienvenida automatica se detiene al instante
const CHATS_DIR = path.join(DATA_DIR, 'chats');
const CHATS_META_FILE = path.join(CHATS_DIR, '__meta.json');
const chatFile = accountId => path.join(CHATS_DIR, `${String(accountId).replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
const MEDIA_DIR = path.join(DATA_DIR, 'media');
if (!fs.existsSync(MEDIA_DIR)) {
    try { fs.mkdirSync(MEDIA_DIR, { recursive: true }); } catch (e) {}
}

function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// Cola de escritura POR ARCHIVO: fs.writeFile (async) no garantiza que dos
// llamadas al MISMO archivo terminen en el orden en que se llamaron -- una
// escritura mas vieja puede terminar DESPUES de una mas nueva y pisarla con
// datos viejos. Eso paso de verdad: borro el historial de varias cuentas.
// Encadenando cada escritura detras de la anterior (misma ruta) se garantiza
// el orden sin volver a fs.writeFileSync (que congelaba todo el servidor).
const writeQueues = new Map(); // ruta de archivo -> promesa de la ultima escritura encolada

function writeJson(file, value) {
    const data = JSON.stringify(value);
    const prev = writeQueues.get(file) || Promise.resolve();
    const next = prev
        .catch(() => {})
        .then(async () => {
            const tmp = `${file}.tmp`;
            await fs.promises.writeFile(tmp, data, 'utf8');
            await fs.promises.rename(tmp, file);
        })
        .catch(error => console.error('[CONNECTOR] writeJson:', file, error.message));
    writeQueues.set(file, next);
    return next;
}

// Salas internas = grupos cuyo nombre dice "SALA" (tambien con letras decorativas: NFKC las vuelve normales)
// y con movimiento en los ultimos 7 dias. En Backoffice se muestran como recuadros flotantes.
function esNombreDeSala(nombre) { return /\bSALA\b/i.test(String(nombre || '').normalize('NFKC')); }
function esSala(chat) {
    return Boolean(chat && chat.jid && chat.jid.endsWith('@g.us') && esNombreDeSala(chat.name)
        && (Date.now() - (chat.time || 0)) < 7 * 24 * 3600 * 1000);
}

// Dia calendario en Peru (UTC-5) de un instante; no depende de la zona horaria del servidor
function diaPeru(ms = Date.now()) { return new Date(ms - 5 * 3600 * 1000).toISOString().slice(0, 10); }

function digits(value) { return String(value || '').replace(/\D/g, ''); }

// Consulta del @usuario a WhatsApp. El protocolo de Baileys descarta la respuesta cuando llega en
// binario (Buffer) o trae un nodo de error, y por eso siempre devolvia 0 usuarios.
let muestrasUsuario = 0;
function protocoloUsuario() {
    return {
        name: 'username',
        getQueryElement: () => ({ tag: 'username', attrs: {} }),
        getUserElement: () => null,
        parser(node) {
            if (!node || node.tag !== 'username') return null;
            let c = node.content;
            if (muestrasUsuario < 5) {
                muestrasUsuario++;
                const tipo = c instanceof Uint8Array ? 'binario' : (Array.isArray(c) ? 'lista' : typeof c);
                console.log(`[USUARIOS] respuesta de WhatsApp: attrs=${JSON.stringify(node.attrs || {})} contenido=${tipo}`);
            }
            if (c instanceof Uint8Array) c = Buffer.from(c).toString('utf8');
            if (typeof c !== 'string') return null;
            c = c.trim().replace(/^@+/, '');
            return c || null;
        }
    };
}
function consultaUsuarios(jids) {
    const q = new Baileys.USyncQuery().withContext('interactive');
    q.protocols.push(protocoloUsuario());
    for (const jid of jids) q.withUser(new Baileys.USyncUser().withId(jid));
    return q;
}

// WhatsApp guarda en cada carpeta de sesion el par LID -> numero (lid-mapping-<lid>_reverse.json).
// El LID es de la persona, asi que lo que sabe una linea sirve para todas.
function numeroDeLidGuardado(lid) {
    const id = String(lid || '').split('@')[0].split(':')[0];
    if (!/^\d+$/.test(id)) return '';
    let carpetas = [];
    try { carpetas = fs.readdirSync(AUTH_DIR); } catch { return ''; }
    for (const carpeta of carpetas) {
        try {
            const v = JSON.parse(fs.readFileSync(path.join(AUTH_DIR, carpeta, `lid-mapping-${id}_reverse.json`), 'utf8'));
            const n = digits(String(v || '').split('@')[0].split(':')[0]);
            if (n.length >= 9 && n.length <= 12) return localPhone(n);
        } catch {}
    }
    return '';
}
function localPhone(value) {
    const number = digits(value);
    if (number.startsWith('51') && number.length === 11) return number.slice(2);
    return number;
}


// whatsapp-web.js (Puppeteer + Chrome real) autenticaba el QR pero
// window.WWebJS.getChats() tiraba un error minificado ("r") porque el script
// inyectado de la libreria ya no encajaba con el bundle actual de WhatsApp Web
// (probado con la version mas reciente via webVersionCache y sigue fallando).
// Baileys no depende de Chrome ni de scrapear el HTML de WhatsApp Web: habla
// directo el protocolo WebSocket de WhatsApp Multi-Device, asi que no le afecta
// que WhatsApp cambie la estructura interna de su pagina web.
function silentLogger() {
    const noop = () => {};
    return { level: 'silent', trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop, child: () => silentLogger() };
}

// protocolMessage / senderKeyDistributionMessage / pollUpdateMessage / reactionMessage
// son trafico interno de WhatsApp (sync de claves, historial, recibos, etc.), no
// conversaciones reales. Si el mensaje no trae ninguno de los tipos "de contenido"
// de abajo, se descarta (devuelve null) para no crear chats fantasma.
function extractText(msg) {
    const m = msg.message;
    if (!m) return null;
    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
    const img = m.imageMessage || m.ephemeralMessage?.message?.imageMessage || m.viewOnceMessage?.message?.imageMessage || m.viewOnceMessageV2?.message?.imageMessage;
    if (img) return img.caption || '(Imagen)';
    if (m.videoMessage) return m.videoMessage.caption || '(Video)';
    if (m.documentMessage) return m.documentMessage.fileName || '(Documento)';
    if (m.audioMessage) return '(Audio)';
    if (m.stickerMessage || m.ephemeralMessage?.message?.stickerMessage) return '(Sticker)';
    if (m.locationMessage) return '(Ubicacion)';
    return null;
}

async function extractMediaUrl(sock, msg) {
    try {
        const m = msg.message;
        if (!m) return null;
        const img = m.imageMessage ||
                    m.ephemeralMessage?.message?.imageMessage ||
                    m.viewOnceMessage?.message?.imageMessage ||
                    m.viewOnceMessageV2?.message?.imageMessage;
        const sticker = m.stickerMessage ||
                        m.ephemeralMessage?.message?.stickerMessage;

        if (!img && !sticker) return null;

        const id = msg.key?.id;
        const ext = sticker ? 'webp' : 'jpg';

        // 1. Si el archivo ya se descargó previamente en disco, usar su URL directa
        if (id) {
            const fileName = `${id}.${ext}`;
            if (fs.existsSync(path.join(MEDIA_DIR, fileName))) {
                return `/media/${fileName}`;
            }
        }

        // 2. Intentar descargar imagen en alta resolución desde WhatsApp
        if (typeof downloadMediaMessage === 'function') {
            try {
                const buffer = await downloadMediaMessage(
                    msg,
                    'buffer',
                    {},
                    {
                        logger: silentLogger(),
                        reuploadRequest: sock?.updateMediaMessage
                    }
                );
                if (buffer && buffer.length > 0) {
                    const fileName = `${id || Date.now()}.${ext}`;
                    fs.writeFileSync(path.join(MEDIA_DIR, fileName), buffer);
                    return `/media/${fileName}`;
                }
            } catch (err) {
                // Si la descarga falla (archivo expirado en CDN), se recurre al thumbnail incrustado
            }
        }

        // 3. Fallback instantáneo al thumbnail incrustado en el mensaje
        if (img?.jpegThumbnail) {
            try {
                const base64 = Buffer.from(img.jpegThumbnail).toString('base64');
                return `data:image/jpeg;base64,${base64}`;
            } catch (e) {}
        }
    } catch (err) {
        console.error('[MEDIA] Error extrayendo imagen:', err.message);
    }
    return null;
}

class WhatsAppConnector {
    constructor() {
        // Cada cuenta de WhatsApp pertenece a un modulo: 'bandeja' (atencion a
        // clientes, hasta 20 lineas fusionadas) o 'backdata' (responder en los
        // 5-6 grupos de envio de clientes). Las cuentas viejas sin este campo
        // se asumen 'bandeja' (comportamiento previo).
        this.tabs = readJson(TABS_FILE, [{ id: 'cuenta_1', title: 'Cuenta 1' }])
            .map(tab => ({ module: 'bandeja', ...tab }));
        this.sockets = new Map();       // accountId -> sock
        this.states = new Map();        // accountId -> { status, qrData }
        this.chats = new Map();         // accountId -> Map(chatKey -> { name, phone, preview, count, time })
        this.chatMessages = new Map();  // accountId -> Map(chatKey -> [serialized messages])
        this.groupNames = new Map();    // accountId -> Map(groupJid -> subject)
        this.sentByAgent = new Map();   // waMessageId -> nombre del asesor que lo envio
        this.contacts = new Map();      // accountId -> Map(jid -> name/username)
        this.pendingPairingPhone = new Map(); // accountId -> telefono pedido para vincular por codigo (vive hasta que registra o se cancela)
        this.pairingAttempts = new Map();     // accountId -> cuantos reconnects van en este intento de vinculo por codigo
        this.pairingCodeRequested = new Set(); // accountId -> ya se pidio el codigo para este intento (no pedir otro en cada reconnect)
        this.dismissed = new Set();
        this.usernameByLid = new Map();   // jid LID -> @usuario (es de la persona: sirve para todas las lineas)
        this._resolviendoUsuarios = new Set();
        this.bienvenidaCola = [];          // chats nuevos esperando su bienvenida automatica
        this.bienvenidaCorriendo = false;
        this.bienvenidaVista = new Set();  // modo dry: para anotar una sola vez cada chat
        // Datos de cada grupo (participantes) en memoria: sin esto Baileys se los pide a WhatsApp en CADA
        // mensaje que se envia a un grupo, y en salas grandes eso tarda o WhatsApp lo frena (envio fallido).
        this.metaGrupos = new Map();       // `${accountId}|${jid}` -> { meta, at }
        this.desvinculadas = readJson(DESVINCULADAS_FILE, {}); // accountId -> { at, motivo }
        this.cierresManuales = new Map();  // accountId -> cuando se cerro a proposito (Reiniciar QR, codigo, eliminar)
        this.arranqueRevisado = new Set(); // cuentas ya revisadas al arrancar el servicio
        this.server = null;
        this.shuttingDown = false;
        this.saveChatsTimer = null;
        this.dirtyChats = new Set(); // cuentas con cambios pendientes de guardar
        this.dirtyAll = false;       // guardar todas (migracion o llamada sin cuenta)
        this._broadcastQueueTimer = null;
        this._broadcastQueuePendingSound = false;
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        fs.mkdirSync(CHATS_DIR, { recursive: true });
        this.loadChats();
        // NO se vuelve a escribir aqui: tabs.json puede estar en un estado
        // transitorio (justo mientras se crea/borra una linea) al arrancar, y
        // guardar en ese momento persistia una purga equivocada, borrando
        // historial real mas de una vez. Ver loadChats(): ya no borra nada, solo
        // deja de mostrar cuentas que no estan en tabs.json (getQueue tambien
        // filtra), sin tocar el archivo en disco.
    }

    saveTabs() { writeJson(TABS_FILE, this.tabs); }

    // Sin esto, cada reinicio del servicio (deploy, crash, systemctl restart)
    // borraba TODA la bandeja de chats de memoria. Se guarda en disco con
    // debounce (2s) para no escribir en cada mensaje individual.
    readChatsDir() {
        const raw = {};
        const meta = readJson(CHATS_META_FILE, {});
        raw.__dismissed = meta.dismissed || [];
        raw.__contacts = [];
        for (const file of fs.readdirSync(CHATS_DIR)) {
            if (!file.endsWith('.json') || file.startsWith('__')) continue;
            const data = readJson(path.join(CHATS_DIR, file), null);
            if (!data || !data.accountId) continue;
            raw[data.accountId] = { chats: data.chats || [], messages: data.messages || [] };
            if (data.contacts) raw.__contacts.push([data.accountId, data.contacts]);
        }
        return raw;
    }

    loadChats() {
        const hayCarpeta = fs.readdirSync(CHATS_DIR).some(f => f.endsWith('.json') && !f.startsWith('__'));
        const migrar = !hayCarpeta && fs.existsSync(CHATS_FILE);
        const raw = hayCarpeta ? this.readChatsDir() : readJson(CHATS_FILE, {});
        for (const key of raw.__dismissed || []) this.dismissed.add(key);
        if (raw.__contacts && Array.isArray(raw.__contacts)) {
            for (const [accId, list] of raw.__contacts) {
                this.contacts.set(accId, new Map(list || []));
            }
        }
        for (const [accountId, data] of Object.entries(raw)) {
            if (accountId.startsWith('__')) continue;
            // Antes se descartaba aqui (y se reescribia el archivo al toque) todo
            // lo que no estuviera en tabs.json en ESE instante -- tabs.json puede
            // estar en un estado transitorio (justo creando/borrando una linea) y
            // eso llego a borrar historial real de cuentas validas mas de una vez.
            // Ahora se carga TODO igual; lo que no tiene una cuenta activa
            // simplemente no se muestra (ver getQueue), sin destruir nada.
            const chatsMap = new Map(data.chats || []);
            const msgsMap = new Map(data.messages || []);

            // Sanitizar y auto-resolver leads sin teléfono o llamados 'Usuario WhatsApp'
            const contactsMap = this.contacts.get(accountId) || new Map();
            const authDir = path.join(AUTH_DIR, accountId);
            for (const [k, chat] of chatsMap.entries()) {
                if (chat.phone && /^\d{13,20}$/.test(chat.phone)) {
                    chat.phone = '';
                }
                const lidDigits = (chat.jid || '').split('@')[0];

                // 1. Si no tiene teléfono o es LID, revisar mapping inverso de Baileys en disco
                if (!chat.phone && lidDigits && fs.existsSync(authDir)) {
                    const revFile = path.join(authDir, `lid-mapping-${lidDigits}_reverse.json`);
                    if (fs.existsSync(revFile)) {
                        try {
                            const raw = JSON.parse(fs.readFileSync(revFile, 'utf8'));
                            if (raw) {
                                let clean = String(raw).replace(/\D/g, '');
                                if (clean.startsWith('519') && clean.length === 11) clean = clean.slice(2);
                                if (clean.length === 9 && clean.startsWith('9')) {
                                    chat.phone = clean;
                                    if (!chat.name || chat.name === 'Usuario WhatsApp' || /^\d{13,20}$/.test(chat.name)) {
                                        chat.name = clean;
                                    }
                                }
                            }
                        } catch {}
                    }
                }


                // 3. Si tiene username o pushname conocido en contactos, asignarlo
                const known = contactsMap.get(chat.jid) || contactsMap.get(lidDigits);
                if (known && (!chat.name || chat.name === 'Usuario WhatsApp' || /^\d{13,20}$/.test(chat.name))) {
                    chat.name = known;
                    if (known.startsWith('@')) chat.username = known;
                }

                if (chat.name && /^\d{13,20}$/.test(chat.name)) {
                    chat.name = chat.phone || 'Usuario WhatsApp';
                }
            }

            this.chats.set(accountId, chatsMap);
            this.chatMessages.set(accountId, msgsMap);
        }
        if (migrar) this.migrarArchivoAntiguo();
    }

    // Una sola vez: escribe un archivo por cuenta y, solo si TODOS quedaron en disco,
    // aparta el archivo antiguo (no se borra: queda como respaldo .migrado).
    migrarArchivoAntiguo() {
        this.dirtyAll = true;
        this.saveChatsNow().then(() => {
            const ids = new Set([...this.chats.keys(), ...this.chatMessages.keys(), ...this.contacts.keys()]);
            const completo = [...ids].every(id => fs.existsSync(chatFile(id)));
            if (!completo) {
                console.error('[CONNECTOR] Migracion incompleta: se conserva baileys-chats.json sin tocar');
                return;
            }
            try {
                fs.renameSync(CHATS_FILE, `${CHATS_FILE}.migrado-${Date.now()}`);
                console.log(`[CONNECTOR] Chats migrados a ${CHATS_DIR} (${ids.size} cuentas)`);
            } catch (error) {
                console.error('[CONNECTOR] No se pudo apartar el archivo antiguo:', error.message);
            }
        });
    }

    saveChatsNow() {
        const ids = this.dirtyAll
            ? new Set([...this.chats.keys(), ...this.chatMessages.keys(), ...this.contacts.keys()])
            : new Set(this.dirtyChats);
        this.dirtyChats.clear();
        this.dirtyAll = false;
        const writes = [];
        for (const accountId of ids) {
            if (!this.chats.has(accountId) && !this.chatMessages.has(accountId) && !this.contacts.has(accountId)) continue;
            writes.push(writeJson(chatFile(accountId), {
                accountId,
                chats: Array.from((this.chats.get(accountId) || new Map()).entries()),
                messages: Array.from((this.chatMessages.get(accountId) || new Map()).entries()),
                contacts: Array.from((this.contacts.get(accountId) || new Map()).entries())
            }));
        }
        writes.push(writeJson(CHATS_META_FILE, { dismissed: Array.from(this.dismissed) }));
        // Devuelve la promesa de escritura: quien apaga el proceso (gracefulShutdown)
        // necesita esperarla antes de salir, si no el ultimo guardado se corta a
        // medias y el archivo en disco queda con datos viejos/incompletos.
        return Promise.all(writes).catch(error => console.error('[CONNECTOR] saveChats:', error.message));
    }

    // accountId: cuenta que cambio. Sin cuenta se guardan todas (nunca pierde datos).
    saveChats(accountId) {
        if (accountId) this.dirtyChats.add(accountId); else this.dirtyAll = true;
        if (this.saveChatsTimer) return;
        this.saveChatsTimer = setTimeout(() => {
            this.saveChatsTimer = null;
            this.saveChatsNow();
        }, 2000);
        this.saveChatsTimer.unref();
    }

    // getQueue() reconstruye TODA la bandeja (15000+ chats) y se mandaba por
    // WebSocket a cada agente cada vez que pasaba cualquier cosa (cada mensaje,
    // cada reconexion, cada 5s por el timer) -- eso era lo que hacia sentir lento
    // el panel. Se agrupan los pedidos en una sola tanda cada ~1.2s.
    // fast=true: accion del asesor (marcar atendido, mover de bloque): se avisa en ~150 ms.
    // Lo demas (mensajes entrantes, reconexiones) se agrupa cada ~1.2 s.
    scheduleBroadcastQueue(playSound = false, fast = false) {
        if (playSound) this._broadcastQueuePendingSound = true;
        if (this._broadcastQueueTimer) {
            if (!fast || this._broadcastQueueFast) return;
            clearTimeout(this._broadcastQueueTimer);
            this._broadcastQueueTimer = null;
        }
        this._broadcastQueueFast = fast;
        this._broadcastQueueTimer = setTimeout(() => {
            this._broadcastQueueTimer = null;
            this._broadcastQueueFast = false;
            const sound = this._broadcastQueuePendingSound;
            this._broadcastQueuePendingSound = false;
            this.server?.broadcastQueue(this.getQueue(), sound);
        }, fast ? 150 : 1200);
        this._broadcastQueueTimer.unref();
    }

    async createClient(tab) {
        if (this.sockets.has(tab.id)) return this.sockets.get(tab.id);
        this.states.set(tab.id, { status: 'connecting', qrData: null });

        const authDir = path.join(AUTH_DIR, tab.id);
        fs.mkdirSync(authDir, { recursive: true });
        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        if (!this.arranqueRevisado.has(tab.id)) {
            this.arranqueRevisado.add(tab.id);
            if (!state.creds.me?.id && (this.chats.get(tab.id)?.size || 0) > 0 && !this.fueCierreManual(tab.id)) {
                this.marcarDesvinculada(tab, 'La linea no tiene sesion activa: hay que volver a vincularla');
            }
        }
        const { version } = await fetchLatestBaileysVersion();

        // "NetContact CRM" como nombre de plataforma no es un sistema operativo
        // real; WhatsApp parece rechazar casi de inmediato el vinculo por codigo
        // con un identificador asi (no tanto el QR, que es mas permisivo). Se usa
        // el preset de Baileys (identificador "real") SOLO para sesiones nuevas
        // sin registrar, para no tocar el fingerprint de las cuentas ya vinculadas.
        const sock = makeWASocket({
            version,
            auth: state,
            logger: silentLogger(),
            browser: state.creds.registered ? ['NetContact CRM', 'Chrome', '131.0.0.0'] : Browsers.ubuntu('Chrome'),
            // El historial completo carga mucho CPU/RAM al vincular cada cuenta; en Krono
            // (servidor compartido con MySQL) va apagado. WA_SYNC_FULL_HISTORY=1 lo reactiva.
            syncFullHistory: process.env.WA_SYNC_FULL_HISTORY === '1',
            cachedGroupMetadata: async jid => this.metaGrupoEnCache(tab.id, jid),
            markOnlineOnConnect: false
        });

        sock.ev.on('creds.update', saveCreds);
        // Si cambian los participantes o el grupo, se vuelve a pedir en el siguiente envio
        sock.ev.on('groups.update', cambios => { for (const g of cambios || []) if (g?.id) this.metaGrupos.delete(`${tab.id}|${g.id}`); });
        sock.ev.on('group-participants.update', ev => { if (ev?.id) this.metaGrupos.delete(`${tab.id}|${ev.id}`); });

        // Vinculo por codigo (sin camara): si alguien pidio un telefono para esta
        // cuenta y la sesion todavia no esta registrada, se pide el codigo de 8
        // caracteres en vez de esperar a que WhatsApp mande el QR.
        // IMPORTANTE: el codigo se pide UNA SOLA VEZ por intento. WhatsApp corta la
        // conexion un instante despues de entregarlo (parte normal del protocolo);
        // el reconnect de mas abajo NO debe volver a pedir otro codigo -- eso es lo
        // que estaba pasando antes y probablemente hizo que WhatsApp empezara a
        // rechazar los intentos por verse como spam. Solo se reconecta y se espera.
        const pairingPhone = this.pendingPairingPhone.get(tab.id);
        if (pairingPhone && !state.creds.registered && !this.pairingCodeRequested.has(tab.id)) {
            this.pairingCodeRequested.add(tab.id);
            (async () => {
                try {
                    // requestPairingCode no espera solo a que el socket termine de
                    // conectar: si se llama muy temprano tira "Connection Closed".
                    await sock.waitForSocketOpen();
                    const code = await sock.requestPairingCode(pairingPhone);
                    console.log(`[STATE] ${tab.id}: pairing_code_ready`);
                    this.states.set(tab.id, { status: 'pairing_code_ready', pairingCode: code, qrData: null });
                    this.server?.broadcastAccounts(this.getTabs());
                } catch (error) {
                    console.error('[CONNECTOR] requestPairingCode:', error.message);
                    this.states.set(tab.id, { status: 'error', error: error.message, qrData: null });
                    this.server?.broadcastAccounts(this.getTabs());
                }
            })();
        }

        sock.ev.on('connection.update', async update => {
            const { connection, lastDisconnect, qr } = update;

            // Si se pidio codigo de emparejamiento, ignorar el QR que WhatsApp
            // manda en paralelo: mostrar ambos confunde, y el codigo ya alcanza.
            if (qr && !pairingPhone) {
                console.log(`[STATE] ${tab.id}: qr_ready`);
                const qrData = await QRCode.toDataURL(qr, { width: 360, margin: 1 });
                this.states.set(tab.id, { status: 'qr_ready', qrData });
                this.server?.broadcastAccounts(this.getTabs());
            }

            if (connection === 'open') {
                console.log(`[STATE] ${tab.id}: ready`);
                this.pendingPairingPhone.delete(tab.id);
                this.pairingAttempts.delete(tab.id);
                this.pairingCodeRequested.delete(tab.id);
                this.states.set(tab.id, { status: 'connected', qrData: null });
                this.quitarDesvinculada(tab.id);
                this.server?.broadcastAccounts(this.getTabs());

                setTimeout(() => {
                    this.resolveAllLidUsernames(tab.id).catch(() => {});
                }, 3000);
                setTimeout(() => {
                    this.resolveMissingUsernames(tab.id).catch(() => {});
                }, 25000);
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const loggedOut = statusCode === DisconnectReason.loggedOut;
                console.log(`[STATE] ${tab.id}: disconnected code=${statusCode} loggedOut=${loggedOut} registered=${Boolean(state.creds.registered)} msg=${lastDisconnect?.error?.message || '-'}`);
                if (this.pendingPairingPhone.has(tab.id)) {
                    console.log(`[PAIRING DEBUG] ${tab.id}:`, JSON.stringify({
                        message: lastDisconnect?.error?.message,
                        payload: lastDisconnect?.error?.output?.payload,
                        reason: lastDisconnect?.error?.data?.reason,
                        content: lastDisconnect?.error?.data?.content
                    }));
                }
                this.sockets.delete(tab.id);

                // Alerta: la linea estaba vinculada y WhatsApp la saco (cerraron la sesion desde el celular,
                // o WhatsApp la bloqueo). No cuenta si fue Reiniciar QR / codigo / eliminar desde el panel.
                if ((loggedOut || statusCode === 403) && state.creds.me?.id
                    && !this.pendingPairingPhone.has(tab.id) && !this.fueCierreManual(tab.id) && !this.shuttingDown) {
                    this.marcarDesvinculada(tab, statusCode === 403
                        ? 'WhatsApp restringio o bloqueo la linea'
                        : 'Se cerro la sesion desde el celular (dispositivo desvinculado)');
                }

                // WhatsApp corta esta conexion en cuanto entrega el codigo de
                // emparejamiento (parte normal del protocolo); el reconnect de aqui
                // NO vuelve a pedir otro codigo (ver mas arriba), solo reconecta y
                // espera a que el celular complete el vinculo con el codigo ya dado.
                // Tope bajo (3 reintentos, con pausa) para no martillar el servidor
                // de WhatsApp si de verdad esta rechazando el intento -- eso fue lo
                // que paso antes con un tope de 10 y 1.2s entre cada uno.
                const attempts = this.pairingAttempts.get(tab.id) || 0;
                const stillPairing = this.pendingPairingPhone.has(tab.id) && attempts < 3;

                if (!stillPairing && (loggedOut || (this.pendingPairingPhone.has(tab.id) && attempts >= 3))) {
                    this.pendingPairingPhone.delete(tab.id);
                    this.pairingAttempts.delete(tab.id);
                    this.pairingCodeRequested.delete(tab.id);
                    this.states.set(tab.id, loggedOut
                        ? { status: 'offline', qrData: null }
                        : { status: 'error', error: 'WhatsApp está rechazando el vínculo por código ahora mismo. Espera unos minutos y vuelve a intentar, o usa el QR.', qrData: null });
                } else if (!loggedOut) {
                    this.states.set(tab.id, { status: 'connecting', qrData: null });
                }

                if ((!loggedOut || stillPairing) && !this.shuttingDown) {
                    if (stillPairing) this.pairingAttempts.set(tab.id, attempts + 1);
                    setTimeout(() => { this.createClient(tab).catch(() => {}); }, stillPairing ? 4000 : 3000);
                }
                this.server?.broadcastAccounts(this.getTabs());
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            // type 'notify' = mensaje en vivo; cualquier otro type ('append', etc.)
            // es WhatsApp rellenando historial viejo, no un lead nuevo.
            const isHistory = type !== 'notify';
            for (const msg of messages) await this.handleMessage(tab.id, sock, msg, { isHistory });
            this.scheduleBroadcastQueue(!isHistory);
        });

        sock.ev.on('contacts.upsert', (contacts) => {
            this.handleContactsUpdate(tab.id, contacts);
        });

        sock.ev.on('contacts.update', (updates) => {
            this.handleContactsUpdate(tab.id, updates);
        });

        sock.ev.on('chats.upsert', (chats) => {
            this.handleChatsUpdate(tab.id, chats);
        });

        sock.ev.on('chats.update', (updates) => {
            this.handleChatsUpdate(tab.id, updates);
        });

        // Al conectar, WhatsApp manda el historial reciente y contactos
        sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
            if (chats && chats.length > 0) {
                this.handleChatsUpdate(tab.id, chats);
            }
            if (contacts && contacts.length > 0) {
                this.handleContactsUpdate(tab.id, contacts);
            }
            for (const msg of messages || []) await this.handleMessage(tab.id, sock, msg, { isHistory: true });
            this.server?.broadcastAccounts(this.getTabs());
            this.scheduleBroadcastQueue();
        });

        this.sockets.set(tab.id, sock);
        return sock;
    }

    handleChatsUpdate(accountId, chatList) {
        if (!chatList || !Array.isArray(chatList)) return;
        let map = this.contacts.get(accountId);
        if (!map) { map = new Map(); this.contacts.set(accountId, map); }
        let changed = false;
        for (const c of chatList) {
            const waUser = c.username ? `@${String(c.username).replace(/^@/, '').trim()}` : '';
            const rawUser = waUser || c.displayName || c.name;
            const textUser = String(rawUser || '').trim();
            if (textUser && c.id && !/^\d{13,20}$/.test(textUser)) {
                map.set(c.id, textUser);
                const digitsId = c.id.split('@')[0];
                if (digitsId) map.set(digitsId, textUser);

                const chatsMap = this.chats.get(accountId);
                if (chatsMap) {
                    for (const [k, chat] of chatsMap.entries()) {
                        if (chat.jid === c.id || k.endsWith(`:${digitsId}`) || (chat.jid && chat.jid.split('@')[0] === digitsId)) {
                            if (!chat.name || /^\d{12,20}$/.test(chat.name) || chat.name === 'Sin nombre' || chat.name === 'Usuario WhatsApp') {
                                chat.name = textUser;
                                if (waUser) chat.username = waUser;
                                changed = true;
                            }
                        }
                    }
                }
            }
        }
        if (changed) {
            this.saveChats(accountId);
            this.scheduleBroadcastQueue();
        }
    }

    handleContactsUpdate(accountId, contacts) {
        if (!contacts || !Array.isArray(contacts)) return;
        let map = this.contacts.get(accountId);
        if (!map) { map = new Map(); this.contacts.set(accountId, map); }
        let changed = false;
        for (const c of contacts) {
            const waUser = c.username ? `@${String(c.username).replace(/^@/, '').trim()}` : '';
            let name = waUser || String(c.notify || c.name || c.verifiedName || '').trim();
            if (name && c.id && !/^\d{13,20}$/.test(name)) {
                map.set(c.id, name);
                const digitsId = c.id.split('@')[0];
                if (digitsId) map.set(digitsId, name);

                const chatsMap = this.chats.get(accountId);
                if (chatsMap) {
                    for (const [k, chat] of chatsMap.entries()) {
                        if (chat.jid === c.id || k.endsWith(`:${digitsId}`) || (chat.jid && chat.jid.split('@')[0] === digitsId)) {
                            if (!chat.name || /^\d{12,20}$/.test(chat.name) || chat.name === 'Sin nombre' || chat.name === 'Usuario WhatsApp') {
                                chat.name = name;
                                if (waUser) chat.username = waUser;
                                changed = true;
                            }
                        }
                    }
                }
            }
        }
        if (changed) {
            this.saveChats(accountId);
            this.scheduleBroadcastQueue();
        }
    }

    handleUpdateContactName({ accountId, phone, name, newName }) {
        const cleanName = String(newName || '').trim();
        if (!cleanName) return;
        let chatsMap = this.chats.get(accountId);
        if (!chatsMap) return;

        let contactsMap = this.contacts.get(accountId);
        if (!contactsMap) { contactsMap = new Map(); this.contacts.set(accountId, contactsMap); }

        for (const [k, chat] of chatsMap.entries()) {
            if ((phone && chat.phone === phone) || (chat.name === name) || k.endsWith(`:${phone || name}`)) {
                chat.name = cleanName;
                if (chat.jid) {
                    contactsMap.set(chat.jid, cleanName);
                    const lidDigits = chat.jid.split('@')[0];
                    if (lidDigits) contactsMap.set(lidDigits, cleanName);
                }
                break;
            }
        }
        this.saveChats(accountId);
        this.scheduleBroadcastQueue();
    }

    // Contactos con "privacidad de numero" activada llegan con remoteJid del tipo
    // <id>@lid (no es un telefono real). El numero real viaja en remoteJidAlt, o si
    // no, en el mapa LID->telefono que Baileys arma internamente.
    async resolvePhoneFromJid(sock, jid, remoteJidAlt) {
        let phoneSource = jid;
        if (jid.endsWith('@lid')) {
            if (remoteJidAlt && !remoteJidAlt.endsWith('@lid')) {
                phoneSource = remoteJidAlt;
            } else {
                try {
                    const pn = await sock.signalRepository?.lidMapping?.getPNForLID(jid);
                    if (pn && !pn.endsWith('@lid')) phoneSource = pn;
                } catch {}
            }
        }
        // Si sigue siendo un LID sin resolver, NO es un teléfono real (WhatsApp protege la privacidad)
        if (phoneSource.endsWith('@lid')) return numeroDeLidGuardado(jid);
        const digitsOnly = digits(phoneSource.split('@')[0].split(':')[0]);
        // Un teléfono celular real (con o sin código 51) tiene entre 9 y 12 dígitos
        if (!digitsOnly || digitsOnly.length > 12 || digitsOnly.length < 9) return '';
        return localPhone(digitsOnly);
    }

    // ==================== BIENVENIDA AUTOMATICA Y ALTA EN LA BASE ====================
    // Cuando un cliente NUEVO escribe en vivo: se le manda el mensaje de bienvenida (la respuesta rapida marcada
    // autoNuevos), el chat pasa a Atendido y el cliente (numero y/o @usuario) se registra en la Base de Krono
    // con la campana de la linea.
    //   WA_AUTO_BIENVENIDA = off (nada) | dry (solo anota en el log lo que haria) | on (envia y registra)
    //   WA_AUTO_BIENVENIDA_LINEAS = nombres de linea separados por coma donde aplica (vacio = todas)
    //   archivo data/auto-bienvenida.off = freno de emergencia sin reiniciar
    modoBienvenida(accountId) {
        if (fs.existsSync(APAGAR_BIENVENIDA_FILE)) return 'off';
        const modo = String(process.env.WA_AUTO_BIENVENIDA || 'off').trim().toLowerCase();
        if (modo !== 'on' && modo !== 'dry') return 'off';
        const lineas = String(process.env.WA_AUTO_BIENVENIDA_LINEAS || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
        if (lineas.length) {
            const tab = this.tabs.find(t => t.id === accountId);
            if (!tab || !lineas.includes(String(tab.title || '').trim().toUpperCase())) return 'off';
        }
        return modo;
    }

    // La campana es el nombre de la linea, salvo los alias de data/campanas-alias.json (ej. NX07 -> NX7)
    campanaDeLinea(accountId) {
        const tab = this.tabs.find(t => t.id === accountId);
        const titulo = String(tab?.title || '').trim();
        const alias = readJson(ALIAS_CAMPANAS_FILE, {});
        const clave = Object.keys(alias).find(k => k.toUpperCase() === titulo.toUpperCase());
        return clave ? String(alias[clave]).trim() : titulo;
    }

    datosParaBase(accountId, chat) {
        const usuario = chat.username || (String(chat.name || '').startsWith('@') ? chat.name : '');
        return {
            n1: localPhone(chat.phone) || '',
            usuario_whatsapp: usuario ? String(usuario).replace(/^@+/, '') : '',
            campana: this.campanaDeLinea(accountId)
        };
    }

    programarBienvenida(accountId, key) {
        if (this.modoBienvenida(accountId) === 'off') return;
        const marca = `${accountId}|${key}`;
        if (this.bienvenidaCola.some(i => i.marca === marca)) return;
        if (this.bienvenidaCola.length >= 200) {
            console.warn(`[BIENVENIDA] cola llena (200): se descarta ${marca}`);
            return;
        }
        // 3 a 6 s de espera: parece una persona y da tiempo a que se conozca el @usuario
        const base = Number(process.env.WA_BIENVENIDA_RETARDO_MS || 3000);
        this.bienvenidaCola.push({ accountId, key, marca, listoEn: Date.now() + base + Math.random() * Math.min(base, 3000) });
        this.procesarColaBienvenida();
    }

    // Alta en la Base de un cliente que vuelve a escribir (una vez por dia). No envia ningun mensaje.
    programarAltaBase(accountId, key) {
        if (this.modoBienvenida(accountId) !== 'on') return;
        const chat = this.chats.get(accountId)?.get(key);
        if (!chat || (chat.leadRegistrado && diaPeru(chat.leadRegistrado.at) === diaPeru())) return;
        const marca = `${accountId}|${key}|${diaPeru()}`;
        this._altasProgramadas = this._altasProgramadas || new Set();
        if (this._altasProgramadas.has(marca)) return;
        this._altasProgramadas.add(marca);
        const t = setTimeout(() => {
            this._altasProgramadas.delete(marca);
            this.registrarEnBase(accountId, key).catch(() => {});
        }, Number(process.env.WA_ALTA_RETARDO_MS || 4000));
        if (t.unref) t.unref();
    }

    // El @usuario se supo despues del alta fallida/en espera: se completa el registro
    retomarAltaConUsuario(accountId, chat) {
        if (!chat || !chat.leadEsperaUsuario) return;
        const key = [...(this.chats.get(accountId)?.entries() || [])].find(([, c]) => c === chat)?.[0];
        if (key) this.registrarEnBase(accountId, key, 3).catch(() => {});
    }

    async procesarColaBienvenida() {
        if (this.bienvenidaCorriendo) return;
        this.bienvenidaCorriendo = true;
        try {
            while (this.bienvenidaCola.length && !this.shuttingDown) {
                const item = this.bienvenidaCola.shift();
                const falta = item.listoEn - Date.now();
                if (falta > 0) await new Promise(r => setTimeout(r, falta));
                try { await this.ejecutarBienvenida(item); } catch (e) { console.error('[BIENVENIDA] error:', e.message); }
                // una sola cola para todas las lineas, con pausa entre envios para no parecer un robot
                const pausa = Number(process.env.WA_BIENVENIDA_PAUSA_MS || 2500);
                await new Promise(r => setTimeout(r, pausa + Math.random() * pausa));
            }
        } finally {
            this.bienvenidaCorriendo = false;
        }
    }

    async ejecutarBienvenida({ accountId, key }) {
        const modo = this.modoBienvenida(accountId);
        if (modo === 'off') return;
        const chat = this.chats.get(accountId)?.get(key);
        if (!chat) return;
        // Si en estos segundos un asesor ya lo respondio o lo movio de bloque, no se manda nada
        if (chat.bienvenidaEnviada || (chat.stage && chat.stage !== 'unanswered')) return;
        const linea = this.tabs.find(t => t.id === accountId)?.title || accountId;
        const plantilla = this.server?.quickReplies?.find(q => q.autoNuevos);

        if (modo === 'dry') {
            if (!this.bienvenidaVista.has(`${accountId}|${key}`)) {
                this.bienvenidaVista.add(`${accountId}|${key}`);
                console.log(`[BIENVENIDA dry] linea=${linea} chat=${key} enviaria "${plantilla?.title || 'SIN PLANTILLA'}" y registraria ${JSON.stringify(this.datosParaBase(accountId, chat))}`);
            }
            return;
        }

        const sock = this.sockets.get(accountId);
        if (plantilla && sock && chat.jid) {
            try {
                const sent = await sock.sendMessage(chat.jid, { text: plantilla.text });
                if (sent?.key?.id) this.sentByAgent.set(sent.key.id, 'Bienvenida automática');
                chat.stage = 'attended';
                chat.attendedBy = 'Bienvenida automática';
                chat.count = 0;
                chat.preview = `Bienvenida automática: ${plantilla.text}`;
                chat.time = Date.now();
                chat.bienvenidaEnviada = Date.now();
                this.saveChats(accountId);
                this.scheduleBroadcastQueue(false, true);
                console.log(`[BIENVENIDA] linea=${linea} chat=${key} enviada`);
            } catch (e) {
                console.error(`[BIENVENIDA] linea=${linea} chat=${key} no se pudo enviar: ${e.message}`);
            }
        } else {
            console.warn(`[BIENVENIDA] linea=${linea} chat=${key} sin plantilla o sin conexion: no se envio`);
        }
        // El alta en la Base va aparte: aunque el envio falle, el cliente igual se registra
        this.registrarEnBase(accountId, key).catch(() => {});
    }

    async registrarEnBase(accountId, key, intento = 1) {
        const chat = this.chats.get(accountId)?.get(key);
        // Un alta por cliente y por dia (la Base tambien deduplica por dia + campana)
        if (!chat || (chat.leadRegistrado && diaPeru(chat.leadRegistrado.at) === diaPeru())) return;
        const datos = this.datosParaBase(accountId, chat);
        const reintentar = (ms, siguiente) => {
            const t = setTimeout(() => this.registrarEnBase(accountId, key, siguiente).catch(() => {}), ms);
            if (t.unref) t.unref();
        };
        if (!datos.n1 && !datos.usuario_whatsapp && chat.jid && chat.jid.endsWith('@lid')) {
            const n = numeroDeLidGuardado(chat.jid);
            if (n) { chat.phone = n; datos.n1 = n; }
        }
        if (!datos.n1 && !datos.usuario_whatsapp) {
            // Aun puede llegar el @usuario (se consulta a WhatsApp): una segunda oportunidad
            if (intento === 1) { reintentar(Number(process.env.WA_BASE_ESPERA_USUARIO_MS || 45000), 2); return; }
            console.log(`[BASE] chat=${key} sin numero ni usuario: queda en espera del @usuario`);
            chat.leadEsperaUsuario = true;
            this.saveChats(accountId);
            return;
        }
        if (!datos.campana) { console.warn(`[BASE] chat=${key}: la linea no tiene nombre de campana`); return; }
        const clave = process.env.KRONO_INTERNAL_KEY;
        if (!clave) { console.warn('[BASE] falta KRONO_INTERNAL_KEY: no se registra'); return; }
        const url = `${process.env.KRONO_API_URL || 'http://127.0.0.1:3000'}/api/interno/lead-whatsapp`;
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 8000);
            let res;
            try {
                res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Internal-Key': clave },
                    body: JSON.stringify(datos),
                    signal: ctrl.signal
                });
            } finally {
                clearTimeout(t);
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) throw new Error(`HTTP ${res.status} ${json.mensaje || ''}`.trim());
            chat.leadRegistrado = { id: json.id, yaExistia: Boolean(json.ya_existia), at: Date.now() };
            delete chat.leadPendiente;
            delete chat.leadEsperaUsuario;
            this.saveChats(accountId);
            console.log(`[BASE] chat=${key} ${json.ya_existia ? 'ya estaba en la Base' : 'registrado'} (id ${json.id}) campana=${datos.campana} n1=${datos.n1 || '-'} usuario=${datos.usuario_whatsapp || '-'}`);
        } catch (e) {
            console.warn(`[BASE] chat=${key} intento ${intento} fallo: ${e.message}`);
            if (intento < 3) {
                reintentar(Number(process.env.WA_BASE_REINTENTO_MS || (intento === 1 ? 20000 : 90000)), intento + 1);
            } else {
                chat.leadPendiente = true;
                this.saveChats(accountId);
            }
        }
    }

    // Los que no se pudieron registrar (API caida, etc.) se reintentan cada 20 min
    async reintentarLeadsPendientes() {
        let n = 0;
        for (const [accountId, chatsMap] of this.chats.entries()) {
            if (this.modoBienvenida(accountId) !== 'on') continue;
            for (const [key, chat] of chatsMap.entries()) {
                if (!chat.leadPendiente && !chat.leadEsperaUsuario) continue;
                if (chat.leadRegistrado && diaPeru(chat.leadRegistrado.at) === diaPeru()) continue;
                await this.registrarEnBase(accountId, key, 3);
                if (++n >= 50) return;
            }
        }
    }

    // El @usuario es de la PERSONA, no de la linea: si en otra linea ya lo conocemos se reutiliza
    // sin preguntarle nada a WhatsApp.
    rebuildKnownUsernames() {
        const mapa = this.usernameByLid;
        for (const [accountId, chatsMap] of this.chats.entries()) {
            for (const chat of chatsMap.values()) {
                if (!chat.jid || !chat.jid.endsWith('@lid')) continue;
                const u = chat.username || (String(chat.name || '').startsWith('@') ? chat.name : '');
                if (u) mapa.set(chat.jid, u);
            }
            const contactos = this.contacts.get(accountId);
            if (!contactos) continue;
            for (const [clave, valor] of contactos.entries()) {
                if (typeof valor !== 'string' || !valor.startsWith('@')) continue;
                if (clave.endsWith('@lid')) mapa.set(clave, valor);
                else if (/^\d{10,20}$/.test(clave)) mapa.set(`${clave}@lid`, valor);
            }
        }
    }

    applyKnownUsernames() {
        this.rebuildKnownUsernames();
        let aplicados = 0;
        for (const [accountId, chatsMap] of this.chats.entries()) {
            let cambio = false;
            for (const chat of chatsMap.values()) {
                if (chat.phone || chat.username || !chat.jid || !chat.jid.endsWith('@lid')) continue;
                const u = this.usernameByLid.get(chat.jid);
                if (u) { chat.username = u; cambio = true; aplicados++; }
            }
            if (cambio) this.saveChats(accountId);
        }
        if (aplicados) console.log(`[USUARIOS] ${aplicados} chats sin telefono recibieron su @usuario desde otras lineas`);
        return aplicados;
    }

    // Chats con LID que no tienen numero: se busca en los mapeos LID -> numero guardados por WhatsApp
    completarNumeros() {
        let total = 0;
        for (const [accountId, chatsMap] of this.chats.entries()) {
            let cambio = false;
            for (const chat of chatsMap.values()) {
                if (chat.phone || !chat.jid || !chat.jid.endsWith('@lid')) continue;
                const n = numeroDeLidGuardado(chat.jid);
                if (!n) continue;
                chat.phone = n;
                cambio = true;
                total++;
                this.retomarAltaConUsuario(accountId, chat);
            }
            if (cambio) this.saveChats(accountId);
        }
        if (total) {
            console.log(`[NUMEROS] ${total} chats recuperaron su numero desde el mapeo LID de WhatsApp`);
            this.scheduleBroadcastQueue();
        }
        return total;
    }

    // Chats sin telefono que aun no tienen @usuario: se le consulta a WhatsApp, de a pocos y los mas
    // recientes primero. Lo que no devuelve usuario no se vuelve a preguntar por 7 dias.
    async resolveMissingUsernames(accountId, limite = 150) {
        const sock = this.sockets.get(accountId);
        const chatsMap = this.chats.get(accountId);
        if (!sock || !chatsMap || this._resolviendoUsuarios.has(accountId)) return { total: 0, resueltos: 0 };
        this._resolviendoUsuarios.add(accountId);
        let resueltos = 0;
        try {
            const SIETE_DIAS = 7 * 24 * 3600 * 1000;
            const pendientes = [];
            for (const chat of chatsMap.values()) {
                if (chat.phone || chat.username || !chat.jid || !chat.jid.endsWith('@lid')) continue;
                if (String(chat.name || '').startsWith('@')) continue;
                if (chat.usernameCheckedAt && Date.now() - chat.usernameCheckedAt < SIETE_DIAS) continue;
                pendientes.push(chat);
            }
            pendientes.sort((a, b) => (b.time || 0) - (a.time || 0));
            const lote = pendientes.slice(0, limite);
            if (!lote.length) return { total: 0, resueltos: 0 };
            console.log(`[USUARIOS] ${accountId}: consultando ${lote.length} de ${pendientes.length} chats sin telefono ni usuario`);
            const TANDA = 40;
            for (let i = 0; i < lote.length; i += TANDA) {
                const tanda = lote.slice(i, i + TANDA);
                try {
                    const query = consultaUsuarios(tanda.map(c => c.jid));
                    const res = await sock.executeUSyncQuery(query);
                    const porJid = new Map(tanda.map(c => [c.jid, c]));
                    for (const item of (res && res.list) || []) {
                        const u = item.username ? `@${String(item.username).trim().replace(/^@/, '')}` : '';
                        const chat = porJid.get(item.id);
                        if (u && u !== '@' && chat) {
                            chat.username = u;
                            this.usernameByLid.set(chat.jid, u);
                            resueltos++;
                            this.retomarAltaConUsuario(accountId, chat);
                        }
                    }
                    for (const chat of tanda) chat.usernameCheckedAt = Date.now();
                } catch (err) {
                    console.warn('[USUARIOS] error consultando WhatsApp:', err.message);
                }
                await new Promise(r => setTimeout(r, 1000));
            }
            console.log(`[USUARIOS] ${accountId}: ${resueltos} usuarios encontrados de ${lote.length} consultados`);
            if (lote.length) this.saveChats(accountId);
            if (resueltos) this.scheduleBroadcastQueue();
        } finally {
            this._resolviendoUsuarios.delete(accountId);
        }
        return { total: 0, resueltos };
    }

    async resolveUsernameFromJid(sock, jid) {
        if (!sock || !jid || !jid.endsWith('@lid')) return '';
        try {
            const query = consultaUsuarios([jid]);
            const res = await sock.executeUSyncQuery(query);
            if (res && res.list && res.list.length > 0) {
                const item = res.list[0];
                if (item.username) {
                    const u = String(item.username).trim();
                    if (u) return `@${u.replace(/^@/, '')}`;
                }
            }
        } catch (e) {
            // USync error / not supported
        }
        return '';
    }

    async resolveAllLidUsernames(accountId) {
        const sock = this.sockets.get(accountId);
        const chatsMap = this.chats.get(accountId);
        if (!sock || !chatsMap) return { total: 0, resolved: 0 };

        const pendingJids = [];
        for (const chat of chatsMap.values()) {
            if (chat.jid && chat.jid.endsWith('@lid') && (!chat.name || chat.name === 'Usuario WhatsApp' || /^\d{13,20}$/.test(chat.name))) {
                pendingJids.push(chat.jid);
            }
        }

        if (pendingJids.length === 0) return { total: 0, resolved: 0 };
        console.log(`[USYNC BATCH] Resolviendo ${pendingJids.length} LIDs para cuenta ${accountId}...`);
        let resolvedCount = 0;
        let contactsMap = this.contacts.get(accountId);
        if (!contactsMap) { contactsMap = new Map(); this.contacts.set(accountId, contactsMap); }

        const CHUNK_SIZE = 40;
        for (let i = 0; i < pendingJids.length; i += CHUNK_SIZE) {
            const chunk = pendingJids.slice(i, i + CHUNK_SIZE);
            try {
                const query = consultaUsuarios(chunk).withContactProtocol();
                const res = await sock.executeUSyncQuery(query);
                if (res && res.list) {
                    for (const item of res.list) {
                        const rawU = item.username || item.contact?.name || item.contact?.notify;
                        if (rawU) {
                            const u = String(rawU).trim();
                            const formatted = (item.username) ? `@${u.replace(/^@/, '')}` : u;
                            if (formatted && !/^\d{13,20}$/.test(formatted)) {
                                contactsMap.set(item.id, formatted);
                                const digitsId = item.id.split('@')[0];
                                if (digitsId) contactsMap.set(digitsId, formatted);

                                for (const chat of chatsMap.values()) {
                                    if (chat.jid === item.id) {
                                        chat.name = formatted;
                                        resolvedCount++;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn('[USYNC BATCH ERROR]', err.message);
            }
            await new Promise(r => setTimeout(r, 600));
        }

        console.log(`[USYNC BATCH FINISHED] Resueltos ${resolvedCount} de ${pendingJids.length}`);
        if (resolvedCount > 0) {
            this.saveChats(accountId);
            this.scheduleBroadcastQueue();
        }
        return { total: pendingJids.length, resolved: resolvedCount };
    }

    async resolveGroupName(accountId, sock, jid) {
        let names = this.groupNames.get(accountId);
        if (!names) { names = new Map(); this.groupNames.set(accountId, names); }
        if (names.has(jid)) return names.get(jid);
        try {
            const meta = await sock.groupMetadata(jid);
            if (meta) this.metaGrupos.set(`${accountId}|${jid}`, { meta, at: Date.now() });
            const subject = meta?.subject || jid.split('@')[0];
            names.set(jid, subject);
            return subject;
        } catch {
            return jid.split('@')[0];
        }
    }

    async handleMessage(accountId, sock, msg, { isHistory = false } = {}) {
        try {
            const jid = msg.key?.remoteJid;
            if (!jid || jid === 'status@broadcast' || !msg.message) return;
            const isGroup = jid.endsWith('@g.us');

            const text = extractText(msg);
            if (text === null) return; // trafico interno (sync de claves, historial, etc.), no es un chat real

            const fromMe = Boolean(msg.key.fromMe);
            let agentTag = 'Tú';
            let sentFromPanel = false;
            if (fromMe && msg.key.id && this.sentByAgent.has(msg.key.id)) {
                agentTag = this.sentByAgent.get(msg.key.id);
                this.sentByAgent.delete(msg.key.id);
                sentFromPanel = true;
            }

            const phone = isGroup ? '' : await this.resolvePhoneFromJid(sock, jid, msg.key.remoteJidAlt);

            // En un grupo, quien escribe es msg.key.participant (la persona),
            // no msg.key.remoteJid (el grupo). Usar el jid del grupo aqui
            // mezclaba el nombre de cada remitente con el del ultimo que
            // escribio, y por eso el nombre correcto se perdia o cambiaba solo.
            const senderJid = isGroup ? (msg.key.participant || jid) : jid;

            // Registrar username o pushName de contacto si viene en el mensaje
            let contactsMap = this.contacts.get(accountId);
            if (!contactsMap) { contactsMap = new Map(); this.contacts.set(accountId, contactsMap); }
            const rawWaUser = msg.key?.participantUsername || msg.key?.remoteJidUsername || msg.participantUsername;
            const waUser = rawWaUser ? `@${String(rawWaUser).replace(/^@/, '').trim()}` : '';
            const push = String(msg.pushName || '').trim();
            const detectedName = waUser || push;

            if (!fromMe && detectedName) {
                contactsMap.set(senderJid, detectedName);
                const senderDigits = senderJid.split('@')[0];
                if (senderDigits) contactsMap.set(senderDigits, detectedName);
            }

            const knownName = contactsMap.get(senderJid) || contactsMap.get(senderJid.split('@')[0]);
            let senderName = (!fromMe && detectedName ? detectedName : '') ||
                             knownName ||
                             (isGroup ? '' : phone) ||
                             '';

            if (!senderName || /^\d{12,20}$/.test(senderName)) {
                senderName = isGroup ? 'Participante' : 'Usuario WhatsApp';
            }

            const time = Number(msg.messageTimestamp) * 1000 || Date.now();
            let chatsMap = this.chats.get(accountId);
            if (!chatsMap) { chatsMap = new Map(); this.chats.set(accountId, chatsMap); }

            const lidDigits = jid.split('@')[0];
            let key = `${accountId}:${isGroup ? jid : (phone || lidDigits || senderName)}`;
            let existing = chatsMap.get(key);

            // Si no se encuentra por key exacta, buscar si ya existía bajo su LID anterior
            if (!existing && !isGroup) {
                for (const [k, c] of chatsMap.entries()) {
                    if (c.jid === jid || (lidDigits && (k.endsWith(`:${lidDigits}`) || (c.jid && c.jid.split('@')[0] === lidDigits)))) {
                        key = k;
                        existing = c;
                        break;
                    }
                }
            }
            if (!existing) existing = { count: 0, time: 0 };

            // En un chat 1 a 1, el @usuario que trae el mensaje es el del cliente (sea entrante o enviado)
            if (!isGroup && waUser && waUser !== '@') {
                existing.username = waUser;
                if (jid.endsWith('@lid')) this.usernameByLid.set(jid, waUser);
            }

            // Si es un lead de anuncio sin username conocido, consultar a WhatsApp vía USync en tiempo real
            if (!fromMe && !isHistory && jid.endsWith('@lid') && !phone && !existing.username) {
                const conocido = this.usernameByLid.get(jid);
                if (conocido) {
                    existing.username = conocido;
                } else {
                    this.resolveUsernameFromJid(sock, jid).then(u => {
                        if (!u) return;
                        this.usernameByLid.set(jid, u);
                        const c = chatsMap.get(key);
                        if (!c) return;
                        c.username = u;
                        // El nombre de perfil se respeta; el usuario solo pasa a ser el nombre si no habia ninguno
                        if (!c.name || c.name === 'Usuario WhatsApp' || /^\d{12,20}$/.test(c.name)) {
                            c.name = u;
                            contactsMap.set(jid, u);
                            if (lidDigits) contactsMap.set(lidDigits, u);
                        }
                        this.saveChats(accountId);
                        this.scheduleBroadcastQueue();
                        this.retomarAltaConUsuario(accountId, c);
                    }).catch(() => {});
                }
            }

            let name;
            if (isGroup) {
                name = await this.resolveGroupName(accountId, sock, jid);
            } else if (fromMe) {
                if (existing.name && !/^\d{12,20}$/.test(existing.name) && existing.name !== 'Sin nombre') {
                    name = existing.name;
                } else {
                    name = knownName || senderName;
                }
            } else {
                name = senderName;
            }
            // El historial trae meses de mensajes viejos: si cada uno sumara al
            // contador de "no leidos", los chats antiguos enterrarian a los de hoy
            // en el orden de la bandeja. Solo lo que llega EN VIVO cuenta como no leido.
            const count = fromMe
                ? 0
                : isHistory
                    ? (existing.count || 0)
                    : (this.dismissed.has(key) ? 0 : (existing.count || 0) + 1);
            // El historial no siempre llega en orden cronologico exacto entre chunks;
            // no dejar que un mensaje viejo pise el preview/nombre de uno mas nuevo.
            const isNewer = time >= (existing.time || 0);
            // Conservar la etapa del tablero: antes este set() la borraba, y el eco
            // del mensaje que el asesor acababa de enviar devolvia el chat a
            // "Sin responder". Responder desde el panel => 'attended'. Un chat sin
            // 'stage' previo (primer mensaje de siempre) cae en 'unanswered'.
            let stage = existing.stage;
            let attendedBy = existing.attendedBy;
            // Cliente que ya estaba Atendido y vuelve a escribir EN VIVO => vuelve a "Nuevos / Sin responder"
            // hasta que se le responda o se marque atendido. Los grupos (salas internas) no se mueven y
            // Black List se respeta. Solo un mensaje mas nuevo que lo ultimo del chat cuenta (no un eco o
            // un reintento de un mensaje viejo).
            if (!isHistory && !fromMe && !isGroup && stage === 'attended' && isNewer) {
                stage = 'unanswered';
            }
            // Responder = atendido, sin tener que marcarlo: vale tanto si se responde desde el panel como
            // desde el propio telefono de la linea (antes solo contaba el panel y las respuestas hechas
            // en el celular dejaban el chat en "Nuevo"). Black List se respeta.
            if (!isHistory && fromMe && stage !== 'blacklist') {
                stage = 'attended';
                if (sentFromPanel) attendedBy = agentTag;
            }
            // El historial que llega al escanear/reconectar no son leads nuevos:
            // solo lo que entra EN VIVO despues de la sincronizacion cuenta como 'Nuevo'.
            if (isHistory && !stage) stage = 'attended';
            chatsMap.set(key, {
                accountId,
                jid: isNewer ? jid : (existing.jid || jid),
                name: isNewer ? name : (existing.name || name),
                phone: isNewer ? (phone || existing.phone) : (existing.phone || phone),
                preview: isNewer ? (fromMe ? `${agentTag}: ${text}` : (isGroup ? `${senderName}: ${text}` : text)) : existing.preview,
                time: Math.max(time, existing.time || 0),
                count,
                stage,
                attendedBy,
                username: existing.username,                    // antes se perdia con cada mensaje nuevo
                usernameCheckedAt: existing.usernameCheckedAt,
                bienvenidaEnviada: existing.bienvenidaEnviada,
                leadRegistrado: existing.leadRegistrado,
                leadPendiente: existing.leadPendiente,
                leadEsperaUsuario: existing.leadEsperaUsuario
            });
            if (!fromMe && !isHistory) this.dismissed.delete(key);

            // Cliente NUEVO escribiendo en vivo (sin etapa previa, no grupo, mensaje reciente): bienvenida
            // automatica y alta en la Base. Un mensaje de hace mas de 30 min (cola de cuando el servicio
            // estuvo apagado) no cuenta como nuevo.
            if (!fromMe && !isHistory && !isGroup && !existing.stage && !existing.bienvenidaEnviada
                && (Date.now() - time) < 30 * 60 * 1000) {
                this.programarBienvenida(accountId, key);
            } else if (!fromMe && !isHistory && !isGroup && stage !== 'blacklist'
                && (Date.now() - time) < 30 * 60 * 1000) {
                // Cliente que YA tenia chat y vuelve a escribir: sin bienvenida, pero entra a la Base de hoy
                this.programarAltaBase(accountId, key);
            }

            const mediaUrl = await extractMediaUrl(sock, msg);

            let msgsMap = this.chatMessages.get(accountId);
            if (!msgsMap) { msgsMap = new Map(); this.chatMessages.set(accountId, msgsMap); }
            const list = msgsMap.get(key) || [];
            const msgId = msg.key.id || `wa_${time}_${Math.random().toString(36).slice(2, 8)}`;
            const existingMsg = list.find(m => (msg.key?.id && m.id === msg.key.id) || (m.fromAgent === fromMe && m.text === text && Math.abs((Number(m.time) || 0) - time) < 5000));
            if (existingMsg) {
                if (mediaUrl && !existingMsg.mediaUrl) {
                    existingMsg.mediaUrl = mediaUrl;
                    this.saveChats(accountId);
                }
            } else {
                const newMsg = {
                    id: msgId,
                    fromAgent: fromMe,
                    text,
                    mediaUrl: mediaUrl || undefined,
                    sender: fromMe ? agentTag : (isGroup ? senderName : name),
                    // El front solo pinta esto arriba del mensaje cuando hay varios
                    // remitentes posibles (grupo); en chat 1 a 1 ya se sabe quien es.
                    groupSender: (!fromMe && isGroup) ? senderName : null,
                    time,
                    status: 'sent'
                };
                list.push(newMsg);
                list.sort((a, b) => a.time - b.time);
                while (list.length > 200) list.shift();
                msgsMap.set(key, list);
                this.saveChats(accountId);

                if (!fromMe && !isHistory) {
                    this.server?.broadcast({
                        type: 'MESSAGE_ADDED',
                        chatKey: `${accountId}:${name}`,
                        message: newMsg
                    });
                    if (phone) {
                        this.server?.broadcast({
                            type: 'MESSAGE_ADDED',
                            chatKey: `${accountId}:${phone}`,
                            message: newMsg
                        });
                    }
                }
            }
        } catch (error) {
            console.error('[CONNECTOR] handleMessage:', error.message);
        }
    }

    getQueue() {
        const rows = [];
        for (const [accountId, chatsMap] of this.chats.entries()) {
            const tab = this.tabs.find(item => item.id === accountId);
            // Cuentas que ya no estan en tabs.json no se muestran (sus datos NO
            // se borran, ver loadChats): asi no aparecen etiquetas "CUENTA_X"
            // sueltas, pero tampoco se destruye historial por un estado
            // transitorio de tabs.json.
            if (!tab) continue;
            for (const [chatMapKey, chat] of chatsMap.entries()) {
                if (!chat.count && this.dismissed.has(`${accountId}:${chat.phone || chat.name}`)) continue;
                rows.push({
                    chatKey: chatMapKey, // clave EXACTA del chat (evita confundir duplicados por telefono/nombre)
                    accountId,
                    account: tab?.title || accountId,
                    module: tab?.module || 'bandeja',
                    name: chat.name || chat.phone || 'Sin nombre',
                    preview: chat.preview,
                    leadPhone: chat.phone,
                    chatPhone: chat.phone,
                    leadPhoneDisplay: chat.phone,
                    username: chat.username || '', // @usuario de WhatsApp (contactos sin numero visible)
                    leadStatus: chat.stage || 'unanswered',
                    stage: chat.stage || 'unanswered',
                    attendedBy: chat.attendedBy || null,
                    leadTimes: 0,
                    count: Number(chat.count) || 0,
                    time: chat.time,
                    waitMin: Math.max(0, Math.round((Date.now() - chat.time) / 60000)),
                    isGroup: Boolean(chat.jid && chat.jid.endsWith('@g.us')),
                    esSala: esSala(chat)
                });
            }
        }
        // Orden por hora reciente (como WhatsApp normal). Antes ordenaba primero
        // por cantidad de no-leidos, y un grupo ruidoso con 50+ mensajes sin
        // responder enterraba conversaciones de hoy mucho mas urgentes.
        return rows.sort((a, b) => b.time - a.time);
    }

    getTabs() {
        return this.tabs.map(tab => {
            const chatsMap = this.chats.get(tab.id);
            const unread = chatsMap ? Array.from(chatsMap.values()).reduce((sum, chat) => sum + (Number(chat.count) || 0), 0) : 0;
            return { ...tab, unread, desvinculada: this.desvinculadas[tab.id] || null };
        });
    }

    // Si el panel manda la clave exacta del chat se usa tal cual; solo si no existe se
    // busca por telefono/nombre (que se confunde cuando la misma persona esta duplicada).
    resolveChatKey(accountId, chatKey, phone, name) {
        const chatsMap = this.chats.get(accountId);
        if (chatKey && chatsMap && chatsMap.has(chatKey)) return chatKey;
        return this.findChatKey(accountId, phone, name);
    }

    findChatKey(accountId, phone, name) {
        const chatsMap = this.chats.get(accountId);
        if (!chatsMap) return null;
        const cleanPhone = localPhone(phone);
        if (cleanPhone && chatsMap.has(`${accountId}:${cleanPhone}`)) return `${accountId}:${cleanPhone}`;
        const wanted = String(name || '').trim().toLowerCase();
        if (wanted) {
            for (const [key, chat] of chatsMap.entries()) {
                if (String(chat.name || '').trim().toLowerCase() === wanted) return key;
            }
        }
        return null;
    }

    resolveJid(phone) {
        const d = digits(phone);
        if (!d) return null;
        const full = d.startsWith('51') ? d : `51${d}`;
        return `${full}@s.whatsapp.net`;
    }

    // ==================== SALAS (recuadros flotantes de Backoffice) ====================
    getSalas() {
        const salas = [];
        for (const [accountId, chatsMap] of this.chats.entries()) {
            const linea = this.tabs.find(t => t.id === accountId);
            if (!linea) continue;
            for (const [chatKey, chat] of chatsMap.entries()) {
                if (!esSala(chat)) continue;
                salas.push({
                    accountId, chatKey, linea: linea.title || accountId,
                    name: String(chat.name || '').normalize('NFKC').trim(),
                    preview: chat.preview || '', time: chat.time || 0, count: Number(chat.count) || 0
                });
            }
        }
        // Orden natural por nombre: SALA 1, SALA 2 ... SALA CHANCAY
        return salas.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
    }

    salaPorClave(chatKey) {
        const accountId = String(chatKey || '').split(':')[0];
        const chat = this.chats.get(accountId)?.get(chatKey);
        return esSala(chat) ? { accountId, chat } : null;
    }

    getMensajesSala(chatKey, limit = 60) {
        const sala = this.salaPorClave(chatKey);
        if (!sala) return null;
        const list = this.chatMessages.get(sala.accountId)?.get(chatKey) || [];
        return list.slice(-Math.min(Number(limit) || 60, 200)).map(m => ({
            id: m.id, text: m.text || '', time: m.time, fromAgent: Boolean(m.fromAgent),
            sender: m.groupSender || m.sender || '', mediaUrl: m.mediaUrl || ''
        }));
    }

    async leerSala(chatKey) {
        const sala = this.salaPorClave(chatKey);
        if (!sala) return { ok: false };
        await this.markChatRead({ accountId: sala.accountId, chatKey });
        return { ok: true };
    }

    metaGrupoEnCache(accountId, jid) {
        const item = this.metaGrupos.get(`${accountId}|${jid}`);
        if (item && Date.now() - item.at < 30 * 60 * 1000) return item.meta;
        return undefined;
    }

    async asegurarMetaGrupo(accountId, jid) {
        if (this.metaGrupoEnCache(accountId, jid)) return;
        const sock = this.sockets.get(accountId);
        if (!sock) return;
        try {
            const meta = await sock.groupMetadata(jid);
            if (meta) this.metaGrupos.set(`${accountId}|${jid}`, { meta, at: Date.now() });
        } catch (e) {
            console.warn(`[SALAS] no se pudo leer el grupo ${jid}: ${e.message}`);
        }
    }

    async enviarSala(chatKey, text, agentName) {
        const sala = this.salaPorClave(chatKey);
        if (!sala) return { ok: false, reason: 'sala-no-encontrada' };
        const limpio = String(text || '').trim().slice(0, 4000);
        if (!limpio) return { ok: false, reason: 'mensaje-vacio' };
        const espera = ms => new Promise(r => setTimeout(r, ms));
        let r = { ok: false, reason: 'sin-intentos' };
        for (let intento = 1; intento <= 3; intento++) {
            // Si la linea se esta reconectando (unos segundos), se espera a que vuelva antes de rendirse
            for (let i = 0; i < 10 && !this.sockets.get(sala.accountId); i++) await espera(1000);
            await this.asegurarMetaGrupo(sala.accountId, sala.chat.jid);
            r = await this.sendMessage({ accountId: sala.accountId, chatKey, text: limpio, agentName });
            if (r.ok) {
                if (intento > 1) console.log(`[SALAS] ${sala.chat.name}: enviado en el intento ${intento}`);
                return r;
            }
            console.warn(`[SALAS] ${sala.chat.name}: intento ${intento} fallo: ${r.reason}`);
            // Solo se reintenta lo que seguro NO salio (linea caida / conexion cerrada / WhatsApp frenando);
            // un "Timed Out" pudo haber salido y reintentarlo duplicaria el mensaje
            if (!/cuenta-no-conectada|Connection Closed|Connection Terminated|rate-overlimit|not-acceptable/i.test(String(r.reason))) break;
            if (/rate-overlimit|not-acceptable/i.test(String(r.reason))) this.metaGrupos.delete(`${sala.accountId}|${sala.chat.jid}`);
            await espera(2500 * intento);
        }
        return r;
    }

    async getHistory({ accountId, phone, name, limit = 100 }) {
        await this.markChatRead({ accountId, phone, name });
        const key = this.findChatKey(accountId, phone, name) || `${accountId}:${localPhone(phone) || name}`;
        const chatsMap = this.chats.get(accountId);
        const chat = chatsMap?.get(key);
        const sock = this.sockets.get(accountId);

        if (chat && sock && chat.jid && chat.jid.endsWith('@lid') && (!chat.name || chat.name === 'Usuario WhatsApp' || /^\d{13,20}$/.test(chat.name))) {
            const u = await this.resolveUsernameFromJid(sock, chat.jid);
            if (u) {
                chat.name = u;
                let contactsMap = this.contacts.get(accountId);
                if (contactsMap) {
                    contactsMap.set(chat.jid, u);
                    contactsMap.set(chat.jid.split('@')[0], u);
                }
                this.saveChats(accountId);
                this.scheduleBroadcastQueue();
            }
        }

        const msgsMap = this.chatMessages.get(accountId);
        const list = (msgsMap && msgsMap.get(key)) || [];
        return { phone: localPhone(phone), name: chat?.name, messages: list.slice(-limit), mismatch: false };
    }

    async sendMessage({ accountId, chatKey, phone, name, text, agentName }) {
        const sock = this.sockets.get(accountId);
        if (!sock) return { ok: false, reason: 'cuenta-no-conectada' };
        // Preferir el jid real del chat (funciona con contactos @lid, que no
        // exponen su telefono). Si el chat aun no existe en memoria (nunca hubo
        // mensajes), se arma el jid desde el telefono como respaldo.
        const key = this.resolveChatKey(accountId, chatKey, phone, name);
        const storedJid = key ? this.chats.get(accountId)?.get(key)?.jid : null;
        const jid = storedJid || this.resolveJid(phone);
        if (!jid) return { ok: false, reason: 'telefono-invalido' };
        try {
            const sent = await sock.sendMessage(jid, { text });
            // WhatsApp nos refleja este mismo mensaje via messages.upsert (fromMe:
            // true) sin decirnos que asesor lo escribio. Se guarda aqui para poder
            // etiquetarlo con su nombre real en vez de un generico "Tu".
            if (agentName && sent?.key?.id) this.sentByAgent.set(sent.key.id, agentName);
            // Cuando el asesor responde, pasar automáticamente a 'attended' y
            // actualizar el preview YA (no esperar a que WhatsApp refleje este
            // mismo mensaje via messages.upsert -- esa confirmacion a veces tarda
            // o no llega, y la tarjeta se quedaba mostrando el mensaje viejo del
            // cliente aunque el chat abierto si mostraba la respuesta).
            if (key) {
                const chatsMap = this.chats.get(accountId);
                const chat = chatsMap?.get(key);
                if (chat) {
                    chat.stage = 'attended';
                    chat.attendedBy = agentName || 'Tú';
                    chat.count = 0;
                    chat.preview = `${agentName || 'Tú'}: ${text}`;
                    chat.time = Date.now();
                    this.saveChats(accountId);
                    this.scheduleBroadcastQueue(false, true);
                }
            }
            return { ok: true };
        } catch (error) {
            return { ok: false, reason: error.message };
        }
    }

    async updateChatStage({ accountId, chatKey, phone, name, stage }) {
        const key = this.resolveChatKey(accountId, chatKey, phone, name);
        console.log(`[ETAPA] ${accountId} clave=${key || 'NO ENCONTRADA'} -> ${stage} (pedida: ${chatKey || '-'})`);
        if (key) {
            const chatsMap = this.chats.get(accountId);
            const chat = chatsMap?.get(key);
            if (chat) {
                chat.stage = stage;
                if (stage === 'attended' || stage === 'blacklist') chat.count = 0;
                this.saveChats(accountId);
                this.scheduleBroadcastQueue(false, true);
                return { ok: true };
            }
        }
        return { ok: false, reason: 'chat-no-encontrado' };
    }

    async markChatRead({ accountId, chatKey, phone, name }) {
        const key = this.resolveChatKey(accountId, chatKey, phone, name) || `${accountId}:${localPhone(phone) || name}`;
        if (key) {
            const chatsMap = this.chats.get(accountId);
            const chat = chatsMap?.get(key);
            if (chat && chat.count > 0) {
                chat.count = 0;
                this.saveChats(accountId);
                this.scheduleBroadcastQueue();
            }
            try {
                const sock = this.sockets.get(accountId);
                const jid = chat?.jid || this.resolveJid(phone);
                if (sock && jid) {
                    const msgsMap = this.chatMessages.get(accountId);
                    const list = msgsMap?.get(key) || [];
                    const lastMsg = list[list.length - 1];
                    if (lastMsg && !lastMsg.fromAgent && lastMsg.id && !lastMsg.id.startsWith('wa_')) {
                        await sock.readMessages([{ remoteJid: jid, id: lastMsg.id }]);
                    }
                }
            } catch {}
        }
    }

    async markAttended({ accountId, chatKey, phone, name, agentName }) {
        const key = this.resolveChatKey(accountId, chatKey, phone, name);
        console.log(`[ATENDER] ${accountId} clave=${key || 'NO ENCONTRADA'} (pedida: ${chatKey || '-'})`);
        if (key) {
            const chatsMap = this.chats.get(accountId);
            const chat = chatsMap?.get(key);
            if (chat) {
                chat.count = 0;
                chat.stage = 'attended';
                if (agentName) chat.attendedBy = agentName;
            }
            this.saveChats(accountId);
            this.scheduleBroadcastQueue(false, true);
        }
    }

    async addAccount(body) {
        const module = body?.module === 'backdata' ? 'backdata' : 'bandeja';
        const tab = { id: `cuenta_${Date.now()}`, title: String(body?.title || `Cuenta ${this.tabs.length + 1}`).trim(), module };
        this.tabs.push(tab);
        this.saveTabs();
        await this.createClient(tab);
        return tab;
    }

    // Solo cierra la conexion local (para apagar el proceso o reintentar). NO
    // desvincula el numero de WhatsApp: eso es logoutSocket(), usado unicamente
    // cuando el usuario pide resetear/borrar la cuenta a proposito.
    async closeSocket(accountId) {
        const sock = this.sockets.get(accountId);
        if (!sock) return;
        try { sock.end(undefined); } catch {}
        this.sockets.delete(accountId);
    }

    fueCierreManual(accountId) {
        return Date.now() - (this.cierresManuales.get(accountId) || 0) < 30000;
    }

    marcarDesvinculada(tab, motivo) {
        if (this.desvinculadas[tab.id]) return;
        this.desvinculadas[tab.id] = { at: Date.now(), motivo };
        writeJson(DESVINCULADAS_FILE, this.desvinculadas);
        console.warn(`[ALERTA] La linea ${tab.title || tab.id} (${tab.id}) se desvinculo: ${motivo}`);
    }

    quitarDesvinculada(accountId) {
        if (!this.desvinculadas[accountId]) return;
        delete this.desvinculadas[accountId];
        writeJson(DESVINCULADAS_FILE, this.desvinculadas);
        console.log(`[ALERTA] La linea ${accountId} volvio a estar vinculada`);
    }

    async logoutSocket(accountId) {
        this.cierresManuales.set(accountId, Date.now());
        const sock = this.sockets.get(accountId);
        if (!sock) return;
        try { await sock.logout(); } catch {}
        try { sock.end(undefined); } catch {}
        this.sockets.delete(accountId);
    }

    async resetAccount(accountId) {
        await this.logoutSocket(accountId);
        this.pendingPairingPhone.delete(accountId);
        this.pairingAttempts.delete(accountId);
        this.pairingCodeRequested.delete(accountId);
        // NO se borra this.chats/this.chatMessages aqui: reiniciar es solo para
        // re-vincular el WhatsApp (QR vencido, sesion corrupta, etc.), la cuenta
        // sigue siendo la misma linea y debe conservar su historial.
        const authDir = path.join(AUTH_DIR, accountId);
        if (authDir.startsWith(AUTH_DIR)) fs.rmSync(authDir, { recursive: true, force: true });
        const tab = this.tabs.find(item => item.id === accountId);
        if (tab) await this.createClient(tab);
        return { ok: Boolean(tab) };
    }

    // Vincular sin camara: pide un codigo de 8 caracteres que se escribe en el
    // celular (Dispositivos vinculados > Vincular con numero de telefono) en vez
    // de escanear el QR. Fuerza una sesion nueva, igual que "Reiniciar QR".
    async requestPairingCode(accountId, phone) {
        const tab = this.tabs.find(item => item.id === accountId);
        if (!tab) return { ok: false, error: 'Cuenta no encontrada' };
        const digitsOnly = digits(phone);
        if (digitsOnly.length < 8) return { ok: false, error: 'Numero de telefono invalido' };
        const fullPhone = digitsOnly.startsWith('51') ? digitsOnly : `51${digitsOnly}`;

        await this.logoutSocket(accountId);
        // Igual que resetAccount: vincular por codigo es otra forma de re-vincular
        // la MISMA linea, no debe borrar su historial.
        const authDir = path.join(AUTH_DIR, accountId);
        if (authDir.startsWith(AUTH_DIR)) fs.rmSync(authDir, { recursive: true, force: true });

        this.pendingPairingPhone.set(accountId, fullPhone);
        this.pairingAttempts.set(accountId, 0);
        this.pairingCodeRequested.delete(accountId);
        this.states.set(accountId, { status: 'connecting', qrData: null });
        await this.createClient(tab);
        return { ok: true };
    }

    async deleteAccount(accountId) {
        if (this.tabs.length <= 1) return { ok: false, error: 'Debe haber al menos una cuenta' };
        await this.logoutSocket(accountId);
        this.pendingPairingPhone.delete(accountId);
        this.pairingAttempts.delete(accountId);
        this.pairingCodeRequested.delete(accountId);
        this.chats.delete(accountId);
        this.chatMessages.delete(accountId);
        this.contacts.delete(accountId);
        this.dirtyChats.delete(accountId);
        await (writeQueues.get(chatFile(accountId)) || Promise.resolve()); // que no reaparezca por una escritura en vuelo
        fs.rmSync(chatFile(accountId), { force: true });
        this.saveChatsNow();
        const authDir = path.join(AUTH_DIR, accountId);
        if (authDir.startsWith(AUTH_DIR)) fs.rmSync(authDir, { recursive: true, force: true });
        this.tabs = this.tabs.filter(item => item.id !== accountId);
        this.saveTabs();
        this.quitarDesvinculada(accountId);
        return { ok: true };
    }

    async start() {
        if (!fs.existsSync(ALIAS_CAMPANAS_FILE)) {
            // Nombres de linea que en Krono se llaman distinto (editable en data/campanas-alias.json)
            writeJson(ALIAS_CAMPANAS_FILE, { NX07: 'NX7', EMERSSON: 'EMER' });
        }
        this.applyKnownUsernames();
        try { this.completarNumeros(); } catch (e) { console.warn('[NUMEROS]', e.message); }
        this.server = new MultiAgentServer({
            // PORT pertenece a la API principal de FUTURA. El panel de
            // WhatsApp usa su propio puerto para no competir con ella.
            port: Number(process.env.WA_PORT || 4010),
            dataDir: DATA_DIR,
            getTabs: () => this.getTabs(),
            getQueue: () => this.getQueue(),
            onSendMessage: payload => this.sendMessage(payload),
            onGetChatHistory: payload => this.getHistory(payload),
            onLoadOlderMessages: payload => this.getHistory({ ...payload, limit: 250 }),
            onOpenChat: async payload => this.markChatRead(payload),
            onMarkChatRead: payload => this.markChatRead(payload),
            onUpdateContactName: payload => this.handleUpdateContactName(payload),
            onMarkAttended: payload => this.markAttended(payload),
            onUpdateChatStage: payload => this.updateChatStage(payload),
            onAddAccount: body => this.addAccount(body),
            onGetSalas: () => this.getSalas(),
            onGetMensajesSala: (chatKey, limit) => this.getMensajesSala(chatKey, limit),
            onLeerSala: chatKey => this.leerSala(chatKey),
            onEnviarSala: (chatKey, text, agentName) => this.enviarSala(chatKey, text, agentName),
            onGetAccountStatus: async id => this.states.get(id) || { status: 'offline', qrData: null },
            onGetAccountQr: async id => this.states.get(id) || { status: 'offline', qrData: null },
            onResetAccountSession: id => this.resetAccount(id),
            onRequestPairingCode: (id, phone) => this.requestPairingCode(id, phone),
            onDeleteAccount: id => this.deleteAccount(id),
            onRenameAccount: async (id, title, module) => {
                const tab = this.tabs.find(item => item.id === id);
                if (!tab) return { ok: false, error: 'Cuenta no encontrada' };
                if (title) tab.title = String(title).trim();
                if (module === 'backdata' || module === 'bandeja') tab.module = module;
                this.saveTabs();
                this.server?.broadcastAccounts(this.getTabs());
                this.scheduleBroadcastQueue();
                return { ok: true, tab };
            }
        });
        await this.server.start();
        this.server.primeQueue(this.getQueue());
        // Escalonado: 20 cuentas conectando a la vez saturan CPU y red al arrancar/reiniciar.
        for (const tab of this.tabs) {
            await this.createClient(tab);
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        setInterval(() => {
            this.scheduleBroadcastQueue();
        }, 5000).unref();
        // Cada 20 min se sigue buscando el @usuario de los chats que faltan (150 por linea y vuelta)
        setInterval(async () => {
            for (const id of [...this.sockets.keys()]) {
                try { await this.resolveMissingUsernames(id); } catch {}
            }
            try { this.completarNumeros(); } catch {}
            try { await this.reintentarLeadsPendientes(); } catch {}
        }, 20 * 60 * 1000).unref();
        // Tras un reinicio, las altas pendientes no esperan 20 min (se da tiempo a que reconecten las lineas)
        setTimeout(() => { this.reintentarLeadsPendientes().catch(() => {}); }, 3 * 60 * 1000).unref();
        console.log(`[HEADLESS] CRM QR activo en puerto ${this.server.port} (Baileys)`);
    }
}

module.exports = { WhatsAppConnector };

if (require.main === module) {
    const connector = new WhatsAppConnector();

    // Sin este handler, systemd mata el proceso a los 90s con SIGKILL y no le da
    // tiempo al socket de WhatsApp a cerrar limpio (esto ya corrompio una sesion
    // de Chrome cuando corriamos whatsapp-web.js; con Baileys el archivo de
    // credenciales es mas simple, pero igual cerramos ordenado por las dudas).
    async function gracefulShutdown(signal) {
        if (connector.shuttingDown) return;
        connector.shuttingDown = true;
        console.log(`[HEADLESS] ${signal} recibido, cerrando conexiones de WhatsApp...`);
        const closes = Array.from(connector.sockets.keys()).map(id => connector.closeSocket(id).catch(() => {}));
        await Promise.race([
            Promise.all([connector.saveChatsNow(), ...closes]),
            new Promise(resolve => setTimeout(resolve, 10000))
        ]);
        process.exit(0);
    }
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    connector.start().catch(error => {
        console.error('[HEADLESS FATAL]', error);
        process.exitCode = 1;
    });
}
