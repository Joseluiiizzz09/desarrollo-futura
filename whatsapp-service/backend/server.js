const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
require('./env');
const AuthManager = require('./auth');

class MultiAgentServer {
    constructor(options = {}) {
        this.port = options.port || 4000;
        this.dataDir = options.dataDir || path.join(__dirname, '..', 'data');
        this.auth = new AuthManager(this.dataDir);
        this.onSendMessage = options.onSendMessage || (async () => ({ ok: false, reason: 'no-handler' }));
        this.onGetSalas = options.onGetSalas || (() => []);
        this.onGetMensajesSala = options.onGetMensajesSala || (() => null);
        this.onLeerSala = options.onLeerSala || (async () => ({ ok: false }));
        this.onEnviarSala = options.onEnviarSala || (async () => ({ ok: false, reason: 'no-handler' }));
        this.onOpenChat = options.onOpenChat || (async () => ({ ok: false }));
        this.onMarkChatRead = options.onMarkChatRead || options.onOpenChat || (async () => ({ ok: true }));
        this.onGetChatHistory = options.onGetChatHistory || (async () => []);
        this.onLoadOlderMessages = options.onLoadOlderMessages || (async () => []);
        this.onMarkAttended = options.onMarkAttended || (() => {});
        this.onUpdateContactName = options.onUpdateContactName || (() => {});
        this.getQueue = options.getQueue || (() => []);
        this.getTabs = options.getTabs || (() => []);
        this.getLeads = options.getLeads || (() => ({}));
        this.recordLead = options.recordLead || (() => ({}));
        this.onAddAccount = options.onAddAccount || (async () => ({ ok: false }));
        this.onGetAccountStatus = options.onGetAccountStatus || (async () => ({ status: 'unknown' }));
        this.onGetAccountQr = options.onGetAccountQr || null;
        this.onResetAccountSession = options.onResetAccountSession || (async () => ({ ok: false }));
        this.onRequestPairingCode = options.onRequestPairingCode || (async () => ({ ok: false }));
        this.onDeleteAccount = options.onDeleteAccount || (async () => ({ ok: false }));
        this.onRenameAccount = options.onRenameAccount || (async () => ({ ok: false }));
        this.onUpdateChatStage = options.onUpdateChatStage || (async () => ({ ok: false }));

        this.app = express();
        this.server = null;
        this.wss = null;

        // Estado del sistema multiagente
        this.connectedAgents = new Map(); // socket -> { id, userId, username, name, role, connectedAt }
        this.claimedChats = new Map();    // chatKey (accountId:phone) -> { agentName, claimedAt }
        this.chatHistoryFile = path.join(this.dataDir, 'chat-history.json');
        this.chatMessages = this.loadChatHistory();    // chatKey -> [{ id, sender, text, time, fromAgent, status }]
        this.lastSeenPreviews = new Map(); // chatKey -> last preview string
        this.lastQueueSig = '';
        this.quickReplies = this.loadQuickReplies();
        this.accountLocks = new Map();
    }

    loadChatHistory() {
        try {
            if (fs.existsSync(this.chatHistoryFile)) {
                const raw = fs.readFileSync(this.chatHistoryFile, 'utf-8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    return new Map(Object.entries(parsed));
                }
            }
        } catch (err) {
            console.warn('[SERVER] No se pudo cargar chat-history.json:', err.message);
        }
        return new Map();
    }

    saveChatHistory() {
        if (this._saveChatHistoryTimer) return;
        this._saveChatHistoryTimer = setTimeout(() => {
            this._saveChatHistoryTimer = null;
            try {
                const obj = Object.fromEntries(this.chatMessages);
                fs.writeFileSync(this.chatHistoryFile, JSON.stringify(obj, null, 2), 'utf-8');
            } catch (err) {
                console.warn('[SERVER] No se pudo guardar chat-history.json:', err.message);
            }
        }, 600);
    }

    extractToken(req) {
        // Solo header Authorization: un token en la URL (query string) queda
        // en historiales del navegador, logs de proxy y herramientas de
        // monitoreo. No se usa en ningun lado del frontend, se quita.
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.slice(7).trim();
        }
        return null;
    }

    requireAuth(req, res, next) {
        const token = this.extractToken(req);
        const session = this.auth.getSession(token);
        if (!session) {
            return res.status(401).json({ ok: false, error: 'No autorizado o sesión expirada' });
        }
        req.session = session;
        next();
    }

    requireAdmin(req, res, next) {
        this.requireAuth(req, res, () => {
            if (req.session.role !== 'admin') {
                return res.status(403).json({ ok: false, error: 'Acceso restringido a administradores' });
            }
            next();
        });
    }

    getLocalIps() {
        const interfaces = os.networkInterfaces();
        const ips = [];
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    ips.push(iface.address);
                }
            }
        }
        return ips.length > 0 ? ips : ['localhost'];
    }

    loadQuickReplies() {
        const filePath = path.join(this.dataDir, 'quick-replies.json');
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch {}
        const defaultReplies = [
            { id: '1', title: 'Bienvenida', text: 'Hola, bienvenido a nuestro canal de atención. ¿En qué podemos ayudarte hoy?' },
            { id: '2', title: 'Catálogo de Servicios', text: 'Con gusto te compartimos la información detallada y promociones vigentes. ¿Te interesa algún servicio en específico?' },
            { id: '3', title: 'Métodos de Pago', text: 'Aceptamos transferencias bancarias (BCP, BBVA, Interbank), Yape, Plin y tarjetas de crédito o débito.' },
            { id: '4', title: 'Un momento por favor', text: 'Estamos revisando tu consulta en el sistema, danos un instante por favor.' },
            { id: '5', title: 'Despedida', text: 'Ha sido un placer atenderte. Si tienes alguna otra consulta estamos a tu disposición. Que tengas un buen día.' }
        ];
        try {
            fs.writeFileSync(filePath, JSON.stringify(defaultReplies, null, 2), 'utf-8');
        } catch {}
        return defaultReplies;
    }

    saveQuickReplies(replies) {
        this.quickReplies = replies;
        const filePath = path.join(this.dataDir, 'quick-replies.json');
        try {
            fs.writeFileSync(filePath, JSON.stringify(replies, null, 2), 'utf-8');
        } catch {}
        this.broadcast({ type: 'QUICK_REPLIES_UPDATED', quickReplies: this.quickReplies });
    }

    start() {
        return new Promise((resolve, reject) => {
            this.app.use(express.json());
            this.app.use((req, res, next) => {
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
                res.set('X-Frame-Options', 'SAMEORIGIN');
                res.set('X-Content-Type-Options', 'nosniff');
                res.set('Referrer-Policy', 'same-origin');
                // 'unsafe-inline' porque el panel usa handlers inline (onclick=...)
                // en el HTML generado; endurecer eso es un cambio de frontend aparte.
                res.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self'; connect-src 'self' ws: wss:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'self'");
                next();
            });
            this.app.use(express.static(path.join(__dirname, '..', 'frontend', 'web'), { etag: false, maxAge: 0 }));
            const mediaDir = path.join(this.dataDir, 'media');
            if (!fs.existsSync(mediaDir)) {
                try { fs.mkdirSync(mediaDir, { recursive: true }); } catch (e) {}
            }
            this.app.use('/media', express.static(mediaDir, { maxAge: '7d' }));

            // ==================== ENDPOINTS DE AUTENTICACIÓN ====================
            // El login lo hace Krono; aqui solo se valida su JWT (ver auth.js).
            this.app.get('/api/auth/me', (req, res) => {
                const token = this.extractToken(req);
                const session = this.auth.getSession(token);
                if (!session) {
                    return res.status(401).json({ ok: false, success: false, error: 'No autenticado' });
                }
                const user = this.auth.getUserById(session.userId);
                if (!user || !user.active) {
                    return res.status(401).json({ ok: false, success: false, error: 'Usuario inactivo o no encontrado' });
                }
                res.json({
                    ok: true,
                    success: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        name: user.name,
                        role: user.role
                    }
                });
            });

            this.app.post('/api/auth/logout', (req, res) => {
                const token = this.extractToken(req);
                this.auth.revokeSession(token);
                res.json({ ok: true, success: true });
            });

            // ==================== ENDPOINTS ADMINISTRATIVOS ====================
            this.app.get('/api/admin/users', (req, res) => {
                this.requireAdmin(req, res, () => {
                    const onlineUserIds = new Set();
                    for (const agent of this.connectedAgents.values()) {
                        if (agent.userId) onlineUserIds.add(agent.userId);
                    }
                    res.json({ ok: true, success: true, users: this.auth.getAllUsers(onlineUserIds) });
                });
            });

            this.app.post('/api/admin/users', (req, res) => {
                this.requireAdmin(req, res, () => {
                    const result = this.auth.createUser(req.body || {});
                    if (!result.ok) {
                        return res.status(400).json({ ok: false, success: false, error: result.error });
                    }
                    res.json({ ok: true, success: true, user: result.user });
                });
            });

            this.app.put('/api/admin/users/:id', (req, res) => {
                this.requireAdmin(req, res, () => {
                    const result = this.auth.updateUser(req.params.id, req.body || {});
                    if (!result.ok) {
                        return res.status(400).json(result);
                    }
                    // Si se cambió la contraseña, expulsar sockets viejos
                    if (req.body?.password) {
                        this.kickUserSockets(req.params.id, 'Tu contraseña fue modificada');
                    }
                    res.json({ ok: true, success: true, user: result.user });
                });
            });

            this.app.post('/api/admin/users/:id/toggle', (req, res) => {
                this.requireAdmin(req, res, () => {
                    const result = this.auth.toggleUserActive(req.params.id);
                    if (!result.ok) {
                        return res.status(400).json({ ok: false, success: false, error: result.error });
                    }
                    if (!result.active) {
                        this.kickUserSockets(req.params.id, 'Tu cuenta fue desactivada por el administrador');
                    }
                    res.json({ ok: true, success: true, active: result.active });
                });
            });

            this.app.post('/api/admin/users/:id/kick', (req, res) => {
                this.requireAdmin(req, res, () => {
                    this.auth.revokeUserSessions(req.params.id);
                    this.kickUserSockets(req.params.id, 'Tu sesión fue cerrada por el administrador');
                    res.json({ ok: true, success: true, kicked: true });
                });
            });

            this.app.delete('/api/admin/users/:id', (req, res) => {
                this.requireAdmin(req, res, () => {
                    const result = this.auth.deleteUser(req.params.id);
                    if (!result.ok) {
                        return res.status(400).json({ ok: false, success: false, error: result.error });
                    }
                    this.kickUserSockets(req.params.id, 'Tu cuenta ha sido eliminada');
                    res.json({ ok: true, success: true });
                });
            });

            // ==================== ENDPOINTS DE CUENTAS WHATSAPP ====================
            this.app.get('/api/admin/accounts', (req, res) => {
                this.requireAdmin(req, res, async () => {
                    try {
                        const tabs = this.getTabs();
                        const results = await Promise.all(tabs.map(async (tab) => {
                            let statusInfo = { status: 'offline', qrData: null };
                            try {
                                statusInfo = await Promise.race([
                                    this.onGetAccountStatus(tab.id),
                                    new Promise(resolve => setTimeout(() => resolve({ status: 'connecting', qrData: null }), 4000))
                                ]);
                            } catch {}
                            return {
                                id: tab.id,
                                title: tab.title,
                                unread: tab.unread || 0,
                                status: statusInfo.status,
                                hasQr: Boolean(statusInfo.qrData || statusInfo.status === 'qr_ready'),
                                module: tab.module || 'bandeja',
                                desvinculada: tab.desvinculada || null
                            };
                        }));
                        res.json({ ok: true, success: true, accounts: results });
                    } catch (err) {
                        res.status(500).json({ ok: false, success: false, error: err.message });
                    }
                });
            });

            this.app.get('/api/admin/accounts/:id/qr', (req, res) => {
                this.requireAdmin(req, res, async () => {
                    try {
                        const getQrFn = this.onGetAccountQr || this.onGetAccountStatus;
                        const statusInfo = await getQrFn(req.params.id);
                        res.json({
                            ok: true,
                            success: true,
                            status: statusInfo.status,
                            qrData: statusInfo.qrData || null,
                            pairingCode: statusInfo.pairingCode || null
                        });
                    } catch (err) {
                        res.status(500).json({ ok: false, success: false, error: err.message });
                    }
                });
            });

            this.app.post('/api/admin/accounts', (req, res) => {
                this.requireAdmin(req, res, async () => {
                    try {
                        const result = await this.onAddAccount(req.body || {});
                        res.json({ ok: true, success: true, account: result });
                    } catch (err) {
                        res.status(500).json({ ok: false, success: false, error: err.message });
                    }
                });
            });

            this.app.post('/api/admin/accounts/:id/reset', (req, res) => {
                this.requireAdmin(req, res, async () => {
                    try {
                        const result = await this.onResetAccountSession(req.params.id);
                        res.json({ ok: true, success: true, result });
                    } catch (err) {
                        res.status(500).json({ ok: false, success: false, error: err.message });
                    }
                });
            });

            this.app.post('/api/admin/accounts/:id/pairing-code', (req, res) => {
                this.requireAdmin(req, res, async () => {
                    try {
                        const result = await this.onRequestPairingCode(req.params.id, req.body?.phone);
                        if (!result?.ok) return res.status(400).json({ ok: false, success: false, error: result?.error || 'No se pudo pedir el codigo' });
                        res.json({ ok: true, success: true });
                    } catch (err) {
                        res.status(500).json({ ok: false, success: false, error: err.message });
                    }
                });
            });

            this.app.put('/api/admin/accounts/:id', (req, res) => {
                this.requireAdmin(req, res, async () => {
                    try {
                        const result = await this.onRenameAccount(req.params.id, req.body?.title, req.body?.module);
                        res.json({ ok: true, success: true, result });
                    } catch (err) {
                        res.status(500).json({ ok: false, success: false, error: err.message });
                    }
                });
            });

            this.app.delete('/api/admin/accounts/:id', (req, res) => {
                this.requireAdmin(req, res, async () => {
                    try {
                        const result = await this.onDeleteAccount(req.params.id);
                        res.json({ ok: true, success: true, result });
                    } catch (err) {
                        res.status(500).json({ ok: false, success: false, error: err.message });
                    }
                });
            });

            // Alertas para Jefatura y Backoffice: lineas de WhatsApp que se desvincularon solas
            this.app.get('/api/alertas', (req, res) => {
                this.requireAuth(req, res, () => {
                    const desvinculadas = this.getTabs()
                        .filter(tab => tab.desvinculada)
                        .map(tab => ({ id: tab.id, title: tab.title, at: tab.desvinculada.at, motivo: tab.desvinculada.motivo }));
                    res.json({ ok: true, desvinculadas });
                });
            });

            // Salas internas (grupos "SALA ...") para los recuadros flotantes de Backoffice
            this.app.get('/api/salas', (req, res) => {
                this.requireAuth(req, res, () => res.json({ ok: true, salas: this.onGetSalas() }));
            });
            this.app.get('/api/salas/mensajes', (req, res) => {
                this.requireAuth(req, res, () => {
                    const mensajes = this.onGetMensajesSala(String(req.query.chatKey || ''), req.query.limit);
                    if (!mensajes) return res.status(404).json({ ok: false, error: 'Sala no encontrada' });
                    res.json({ ok: true, mensajes });
                });
            });
            this.app.post('/api/salas/leer', (req, res) => {
                this.requireAuth(req, res, async () => res.json(await this.onLeerSala(String(req.body?.chatKey || ''))));
            });
            this.app.post('/api/salas/enviar', (req, res) => {
                this.requireAuth(req, res, async () => {
                    try {
                        const r = await this.onEnviarSala(String(req.body?.chatKey || ''), req.body?.text, req.session.name || req.session.username || 'Asesor');
                        res.status(r?.ok ? 200 : 400).json({ ok: Boolean(r?.ok), error: r?.ok ? undefined : (r?.reason || 'No se pudo enviar') });
                    } catch (err) {
                        res.status(500).json({ ok: false, error: err.message });
                    }
                });
            });

            // Endpoints de Estado y Colas
            this.app.get('/api/status', (req, res) => {
                this.requireAuth(req, res, () => {
                    const uniqueAgents = this.getUniqueAuthenticatedAgents();
                    res.json({ ok: true, port: this.port, ips: this.getLocalIps(), agentsCount: uniqueAgents.length, agents: uniqueAgents, accounts: this.getTabs() });
                });
            });

            this.app.get('/api/queue', (req, res) => {
                this.requireAuth(req, res, () => res.json({ ok: true, queue: this.getQueue(), claims: Object.fromEntries(this.claimedChats) }));
            });

            this.app.post('/api/chats/stage', (req, res) => {
                this.requireAuth(req, res, async () => {
                    const { accountId, chatKey, phone, name, stage } = req.body || {};
                    if (!accountId || !stage) return res.status(400).json({ ok: false, error: 'Datos incompletos' });
                    try {
                        await this.onUpdateChatStage({ accountId, chatKey, phone, name, stage });
                        res.json({ ok: true });
                    } catch (e) {
                        res.status(500).json({ ok: false, error: e.message });
                    }
                });
            });

            this.app.get('/api/quick-replies', (req, res) => {
                this.requireAuth(req, res, () => res.json({ ok: true, quickReplies: this.quickReplies }));
            });

            this.app.post('/api/quick-replies', (req, res) => {
                this.requireAdmin(req, res, () => {
                    if (Array.isArray(req.body?.quickReplies)) {
                        this.saveQuickReplies(req.body.quickReplies);
                        return res.json({ ok: true, quickReplies: this.quickReplies });
                    }
                    res.status(400).json({ ok: false, error: 'Formato inválido' });
                });
            });
            this.server = http.createServer(this.app);
            // Solo aceptar conexiones WebSocket que vengan del propio panel
            // (mismo origen que sirve el HTML). Evita que otra pagina abra un
            // socket hacia este servidor desde el navegador de un agente logueado.
            const PUBLIC_HOST = process.env.PUBLIC_HOST || 'localhost';
            const ALLOWED_WS_ORIGINS = new Set([
                `http://${PUBLIC_HOST}:${this.port || 4000}`,
                `https://${PUBLIC_HOST}:${this.port || 4000}`,
                ...String(process.env.PUBLIC_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean)
            ]);
            this.wss = new WebSocketServer({
                server: this.server,
                verifyClient: (info, done) => {
                    const origin = info.origin || info.req.headers.origin;
                    if (!origin || ALLOWED_WS_ORIGINS.has(origin)) return done(true);
                    console.warn('[SERVER WS] Origin rechazado:', origin);
                    done(false, 403, 'Origin no permitido');
                }
            });

            this.wss.on('connection', (ws) => {
                const agentId = 'agent_' + Math.random().toString(36).slice(2, 9);
                this.connectedAgents.set(ws, { id: agentId, userId: null, name: 'Asesor', connectedAt: Date.now() });

                ws.send(JSON.stringify({ type: 'INIT', agentId, authenticated: false }));

                ws.on('message', async (raw) => {
                    try {
                        const data = JSON.parse(raw);
                        await this.handleWsMessage(ws, data);
                    } catch (err) {
                        console.error('[SERVER WS ERROR]:', err.message);
                    }
                });

                ws.on('close', () => {
                    const agent = this.connectedAgents.get(ws);
                    if (agent) {
                        // Liberar chats que tenía bloqueados este asesor
                        for (const [key, claim] of this.claimedChats.entries()) {
                            if (claim.agentName === agent.name) {
                                this.claimedChats.delete(key);
                            }
                        }
                    }
                    this.connectedAgents.delete(ws);
                    this.broadcastAgentsList();
                    this.broadcastClaims();
                });
            });

            const tryListen = (currentPort) => {
                const onListening = () => {
                    this.server.removeListener('error', onError);
                    this.port = currentPort;
                    console.log(`[SERVER] NetContact Multiagente corriendo en puerto ${this.port}`);
                    this.iniciarAvisoPresencia();
                    resolve({
                        port: this.port,
                        ips: this.getLocalIps(),
                        url: `http://${this.getLocalIps()[0]}:${this.port}`
                    });
                };

                const onError = (err) => {
                    this.server.removeListener('listening', onListening);
                    if (err.code === 'EADDRINUSE' && currentPort < 4020) {
                        console.warn(`[SERVER] Puerto ${currentPort} en uso, probando puerto ${currentPort + 1}...`);
                        tryListen(currentPort + 1);
                    } else {
                        reject(err);
                    }
                };

                this.server.once('listening', onListening);
                this.server.once('error', onError);
                this.server.listen(currentPort, process.env.HOST || '0.0.0.0');
            };

            tryListen(this.port);
        });
    }


    kickUserSockets(userId, reason = 'Sesión terminada') {
        for (const [ws, agent] of this.connectedAgents.entries()) {
            if (agent.userId === userId) {
                try {
                    ws.send(JSON.stringify({ type: 'FORCE_LOGOUT', reason }));
                    ws.close();
                } catch {}
            }
        }
    }

    withAccountLock(accountId, task) {
        const previous = this.accountLocks.get(accountId) || Promise.resolve();
        const current = previous.catch(() => {}).then(task);
        this.accountLocks.set(accountId, current.finally(() => {
            if (this.accountLocks.get(accountId) === current) this.accountLocks.delete(accountId);
        }));
        return current;
    }
    async handleWsMessage(ws, data) {
        const agent = this.connectedAgents.get(ws);
        const { type } = data;

        if (type === 'AUTH') {
            const token = data.token;
            const session = this.auth.getSession(token);
            if (!session) {
                ws.send(JSON.stringify({ type: 'AUTH_FAILED', error: 'Sesión no válida o expirada' }));
                return;
            }
            const user = this.auth.getUserById(session.userId);
            if (!user || !user.active) {
                ws.send(JSON.stringify({ type: 'AUTH_FAILED', error: 'Usuario inactivo' }));
                return;
            }
            if (agent) {
                agent.userId = user.id;
                agent.username = user.username;
                agent.name = user.name;
                agent.role = user.role;
            }
                        ws.send(JSON.stringify({ type: 'STATE', accounts: this.getTabs(), queue: this.getQueue(), claims: Object.fromEntries(this.claimedChats), quickReplies: this.quickReplies, agents: this.getUniqueAuthenticatedAgents() }));

            return;
        }

        if (!agent?.userId) { ws.send(JSON.stringify({ type: 'AUTH_REQUIRED' })); return; }

        if (type === 'AGENT_JOIN') {
            if (agent && data.name) {
                agent.name = String(data.name).trim().slice(0, 30) || 'Asesor';
                this.broadcastAgentsList();
            }
            return;
        }

        if (type === 'CLAIM_CHAT') {
            const chatKey = `${data.accountId}:${data.phone || data.name}`;
            const current = this.claimedChats.get(chatKey);
            if (current && current.userId !== agent.userId) return;
            this.claimedChats.set(chatKey, {
                userId: agent.userId,
                agentName: agent?.name || 'Asesor',
                claimedAt: Date.now()
            });
            this.broadcastClaims();
            return;
        }

        if (type === 'MARK_CHAT_READ' || type === 'OPEN_CHAT') {
            const { accountId, chatKey: claveExacta, phone, name } = data;
            if (this.onMarkChatRead) {
                this.onMarkChatRead({ accountId, chatKey: claveExacta, phone, name });
            }
            return;
        }

        if (type === 'UPDATE_CONTACT_NAME') {
            const { accountId, phone, name, newName } = data;
            if (this.onUpdateContactName) {
                this.onUpdateContactName({ accountId, phone, name, newName });
            }
            return;
        }

        if (type === 'RELEASE_CHAT') {
            const chatKey = `${data.accountId}:${data.phone || data.name}`;
            this.claimedChats.delete(chatKey);
            this.broadcastClaims();
            return;
        }

        if (type === 'SEND_MESSAGE') {
            const { accountId, chatKey: claveExacta, phone, name, text } = data;
            const cleanText = String(text || '').trim();
            if (!cleanText) return;

            // Notificar que se está enviando
            const msgId = 'msg_' + Date.now();
            const messageObj = {
                id: msgId,
                accountId,
                phone,
                name,
                text: cleanText,
                sender: agent?.username || agent?.name || 'Asesor',
                fromAgent: true,
                time: Date.now(),
                status: 'sending'
            };

            this.appendChatMessage(`${accountId}:${phone || name}`, messageObj);
            this.broadcast({ type: 'MESSAGE_ADDED', chatKey: `${accountId}:${phone || name}`, message: messageObj });

            // Enviar a través de WhatsApp Web en Electron
            try {
                const result = await this.onSendMessage({ accountId, chatKey: claveExacta, phone, name, text: cleanText, agentName: agent?.username || agent?.name || 'Asesor' });
                if (result?.ok) {
                    messageObj.status = 'sent';
                } else {
                    messageObj.status = 'error';
                    messageObj.errorReason = result?.reason || 'Error al enviar por WhatsApp';
                }
            } catch (err) {
                messageObj.status = 'error';
                messageObj.errorReason = err.message;
            }

            this.broadcast({ type: 'MESSAGE_STATUS', chatKey: `${accountId}:${phone || name}`, messageId: msgId, status: messageObj.status, errorReason: messageObj.errorReason });
            return;
        }

        if (type === 'MARK_ATTENDED') {
            const { accountId, chatKey: claveExacta, phone, name, leadPhone } = data;
            this.onMarkAttended({
                accountId,
                chatKey: claveExacta,
                phone: leadPhone || phone,
                name,
                agentName: agent?.username || agent?.name
            });
            const chatKey = `${accountId}:${phone || name}`;
            this.claimedChats.delete(chatKey);
            this.broadcastClaims();
            return;
        }

        if (type === 'UPDATE_CHAT_STAGE') {
            const { accountId, chatKey, phone, name, stage, leadPhone } = data;
            this.onUpdateChatStage({
                accountId,
                chatKey,
                phone: leadPhone || phone,
                name,
                stage
            });
            return;
        }

function isValidPeruvianMobile(str) {
    const digits = String(str || '').replace(/\D/g, '');
    if (digits.length === 9 && digits.startsWith('9')) return digits;
    if (digits.length === 11 && digits.startsWith('519')) return digits.slice(2);
    return '';
}

        if (type === 'GET_CHAT_HISTORY') {
            if (this.onMarkChatRead) {
                this.onMarkChatRead({ accountId: data.accountId, phone: data.phone, name: data.name });
            }
            const phoneValid = isValidPeruvianMobile(data.phone);
            const keyPhone = phoneValid ? `${data.accountId}:${phoneValid}` : null;
            const keyName = data.name ? `${data.accountId}:${String(data.name).trim()}` : null;
            const chatKey = keyPhone || keyName || `${data.accountId}:${data.phone || data.name}`;

            let history = (keyPhone && this.chatMessages.get(keyPhone)) ||
                          (keyName && this.chatMessages.get(keyName)) ||
                          this.chatMessages.get(chatKey) || [];
            let detectedPhone = phoneValid;
            if (history.length > 0) {
                if (history.length === 0 && fetched?.mismatch) {
                const fallback = this.getQueue().find(item => String(item.accountId) === String(data.accountId) && ((data.phone && item.leadPhone === data.phone) || (data.name && item.name === data.name)));
                if (fallback?.preview && !String(fallback.preview).startsWith('(Chat')) {
                    history = [{ id: 'queue_' + Date.now(), accountId: data.accountId, phone: fallback.leadPhone || data.phone, name: fallback.name || data.name, text: String(fallback.preview), sender: fallback.name || 'Cliente', fromAgent: false, time: fallback.time || Date.now(), status: 'received', fallback: true }];
                }
            }
            ws.send(JSON.stringify({ type: 'CHAT_HISTORY', chatKey, phone: detectedPhone, avatarUrl: '', messages: history, partial: true }));
            }
            let fetched = null;
            if (this.onGetChatHistory) {
                try {
                    fetched = await Promise.race([
                        this.withAccountLock(data.accountId, () => this.onGetChatHistory({ accountId: data.accountId, phone: data.phone, name: data.name })),
                        new Promise(resolve => setTimeout(() => resolve(null), 8000))
                    ]);
                    if (fetched) {
                        const newMsgs = Array.isArray(fetched.messages) ? fetched.messages : (Array.isArray(fetched) ? fetched : []);
                        if (newMsgs.length > 0) {
                            const existingMap = new Map();
                            for (const m of history) {
                                if (m && m.id) existingMap.set(m.id, m);
                            }
                            for (const m of newMsgs) {
                                if (!m || !m.id) continue;
                                if (m.fromAgent) {
                                    for (const [k, old] of existingMap.entries()) {
                                        if (old.fromAgent && old.id && old.id.startsWith('msg_') && old.text === m.text && Math.abs((Number(old.time) || 0) - (Number(m.time) || 0)) < 30000) {
                                            existingMap.delete(k);
                                            break;
                                        }
                                    }
                                }
                                existingMap.set(m.id, m);
                            }
                            const cleanHistory = [];
                            for (const item of existingMap.values()) {
                                if (item.fromAgent && item.id && item.id.startsWith('msg_')) {
                                    const hasReal = Array.from(existingMap.values()).some(other => other.fromAgent && other.id && !other.id.startsWith('msg_') && other.text === item.text && Math.abs((Number(other.time) || 0) - (Number(item.time) || 0)) < 30000);
                                    if (hasReal) continue;
                                }
                                cleanHistory.push(item);
                            }
                            history = cleanHistory;
                            history.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));

                            this.chatMessages.set(chatKey, history);
                            if (keyPhone) this.chatMessages.set(keyPhone, history);
                            if (keyName) this.chatMessages.set(keyName, history);
                            if (fetched.phone) {
                                const fp = isValidPeruvianMobile(fetched.phone);
                                if (fp) this.chatMessages.set(`${data.accountId}:${fp}`, history);
                            }
                            this.saveChatHistory();
                        }
                        if (fetched.phone && isValidPeruvianMobile(fetched.phone)) {
                            detectedPhone = isValidPeruvianMobile(fetched.phone);
                        }
                    }
                } catch (err) {
                    console.warn('[SERVER] Error al obtener historial:', err.message);
                }
            }
            ws.send(JSON.stringify({
                type: 'CHAT_HISTORY',
                chatKey,
                phone: detectedPhone,
                name: (fetched && fetched.name) || data.name,
                avatarUrl: (fetched && fetched.avatarUrl) || '',
                messages: history
            }));
            return;
        }

        if (type === 'LOAD_OLDER_MESSAGES') {
            const phoneValid = isValidPeruvianMobile(data.phone);
            const keyPhone = phoneValid ? `${data.accountId}:${phoneValid}` : null;
            const keyName = data.name ? `${data.accountId}:${String(data.name).trim()}` : null;
            const chatKey = keyPhone || keyName || `${data.accountId}:${data.phone || data.name}`;

            let history = (keyPhone && this.chatMessages.get(keyPhone)) ||
                          (keyName && this.chatMessages.get(keyName)) ||
                          this.chatMessages.get(chatKey) || [];
            let detectedPhone = phoneValid;
            let fetched = null;
            if (this.onLoadOlderMessages) {
                try {
                    fetched = await Promise.race([
                        this.withAccountLock(data.accountId, () => this.onLoadOlderMessages({ accountId: data.accountId, phone: data.phone, name: data.name })),
                        new Promise(resolve => setTimeout(() => resolve(null), 8000))
                    ]);
                    if (fetched) {
                        const newMsgs = Array.isArray(fetched.messages) ? fetched.messages : (Array.isArray(fetched) ? fetched : []);
                        if (newMsgs.length > 0) {
                            const existingMap = new Map();
                            for (const m of history) {
                                if (m && m.id) existingMap.set(m.id, m);
                            }
                            for (const m of newMsgs) {
                                if (!m || !m.id) continue;
                                if (m.fromAgent) {
                                    for (const [k, old] of existingMap.entries()) {
                                        if (old.fromAgent && old.id && old.id.startsWith('msg_') && old.text === m.text && Math.abs((Number(old.time) || 0) - (Number(m.time) || 0)) < 30000) {
                                            existingMap.delete(k);
                                            break;
                                        }
                                    }
                                }
                                existingMap.set(m.id, m);
                            }
                            const cleanHistory = [];
                            for (const item of existingMap.values()) {
                                if (item.fromAgent && item.id && item.id.startsWith('msg_')) {
                                    const hasReal = Array.from(existingMap.values()).some(other => other.fromAgent && other.id && !other.id.startsWith('msg_') && other.text === item.text && Math.abs((Number(other.time) || 0) - (Number(item.time) || 0)) < 30000);
                                    if (hasReal) continue;
                                }
                                cleanHistory.push(item);
                            }
                            history = cleanHistory;
                            history.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));

                            this.chatMessages.set(chatKey, history);
                            if (keyPhone) this.chatMessages.set(keyPhone, history);
                            if (keyName) this.chatMessages.set(keyName, history);
                            if (fetched.phone) {
                                const fp = isValidPeruvianMobile(fetched.phone);
                                if (fp) this.chatMessages.set(`${data.accountId}:${fp}`, history);
                            }
                            this.saveChatHistory();
                        }
                        if (fetched.phone && isValidPeruvianMobile(fetched.phone)) {
                            detectedPhone = isValidPeruvianMobile(fetched.phone);
                        }
                    }
                } catch (err) {
                    console.warn('[SERVER] Error al cargar mensajes anteriores:', err.message);
                }
            }
            ws.send(JSON.stringify({
                type: 'CHAT_HISTORY',
                chatKey,
                phone: detectedPhone,
                avatarUrl: (fetched && fetched.avatarUrl) || '',
                messages: history
            }));
            return;
        }
    }

    appendChatMessage(chatKey, message) {
        if (!this.chatMessages.has(chatKey)) {
            this.chatMessages.set(chatKey, []);
        }
        const list = this.chatMessages.get(chatKey);
        // Si llega la confirmación real de WhatsApp de un mensaje del asesor, reemplazar el placeholder temporal msg_
        if (message.fromAgent && message.id && !message.id.startsWith('msg_')) {
            const tempIdx = list.findIndex(m => m.fromAgent && m.id && m.id.startsWith('msg_') && m.text === message.text && Math.abs((Number(m.time) || 0) - (Number(message.time) || 0)) < 30000);
            if (tempIdx !== -1) {
                list[tempIdx] = message;
                this.saveChatHistory();
                return;
            }
        }
        // Evitar duplicar exactamente el mismo mensaje si ya está en la lista
        const exists = list.some(m => m.id === message.id || (m.text === message.text && m.fromAgent === message.fromAgent && Math.abs((Number(m.time) || 0) - (Number(message.time) || 0)) < 15000));
        if (!exists) {
            list.push(message);
            if (list.length > 500) list.shift();
            this.saveChatHistory();
        }
    }

    recordIncomingMessage(accountId, item) {
        const chatKey = `${accountId}:${item.leadPhone || item.name}`;
        const preview = String(item.preview || '').trim();
        if (!preview || preview === '(Mensaje)' || preview.startsWith('(Chat')) return;

        // Si el mensaje en WhatsApp fue enviado por nosotros, NO registrar como entrante
        if (item.isOut) return;

        // Si no hay mensajes no leídos (count <= 0), no es un mensaje entrante nuevo
        if (!item.count || Number(item.count) <= 0) return;

        // Rastreo de último preview para evitar inundación en cada tick de 2 segundos
        if (!this.lastSeenPreviews) {
            this.lastSeenPreviews = new Map();
        }
        const lastPreview = this.lastSeenPreviews.get(chatKey);
        if (lastPreview === preview) {
            return; // No ha cambiado el último mensaje, ignorar
        }

        // Si es la primera vez que vemos este chat, guardar preview sin disparar evento si ya existe en cola
        const isFirstTime = !this.lastSeenPreviews.has(chatKey);
        this.lastSeenPreviews.set(chatKey, preview);

        const list = this.chatMessages.get(chatKey) || [];
        const lastMsg = list.length > 0 ? list[list.length - 1] : null;
        if (lastMsg && lastMsg.text === preview) {
            return;
        }

        // Si ya hay un mensaje con este mismo texto recibido en los últimos 30 segundos, no re-crear
        if (list.some(m => !m.fromAgent && m.text === preview && Math.abs(Date.now() - m.time) < 30000)) {
            return;
        }

        const msgId = 'in_' + Date.now();
        const messageObj = {
            id: msgId,
            accountId,
            phone: item.leadPhone,
            name: item.name,
            text: preview,
            sender: item.name || 'Cliente',
            fromAgent: false,
            time: item.time || Date.now(),
            status: 'received'
        };
        this.appendChatMessage(chatKey, messageObj);
        
        // Solo emitir evento en tiempo real si no es carga inicial o si cambió activamente
        if (!isFirstTime || list.length > 0) {
            this.broadcast({
                type: 'MESSAGE_ADDED',
                chatKey,
                message: messageObj
            });
        }
    }

    broadcast(payload) {
        const msg = JSON.stringify(payload);
        if (!this.wss) return;
        for (const client of this.wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg);
            }
        }
    }

    // "Quien esta conectado" de Jefatura: cada minuto se informa a la API de Krono que usuarios tienen el
    // panel de WhatsApp abierto (esa seccion no consulta la API de Krono y si no parecerian desconectados).
    iniciarAvisoPresencia() {
        if (this._avisoPresencia) return;
        const clave = process.env.KRONO_INTERNAL_KEY;
        if (!clave) return;
        const url = `${process.env.KRONO_API_URL || 'http://127.0.0.1:3000'}/api/interno/presencia-whatsapp`;
        const avisar = async () => {
            const ids = this.getUniqueAuthenticatedAgents()
                .map(a => Number(String(a.id || '').replace(/^krono_/, '')))
                .filter(n => Number.isInteger(n) && n > 0);
            if (!ids.length) return;
            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 8000);
                await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal-Key': clave }, body: JSON.stringify({ ids }), signal: ctrl.signal })
                    .finally(() => clearTimeout(t));
            } catch { /* la API no respondio: se intenta en el siguiente minuto */ }
        };
        this._avisoPresencia = setInterval(avisar, 60000);
        if (this._avisoPresencia.unref) this._avisoPresencia.unref();
        setTimeout(avisar, 15000).unref?.();
    }

    getUniqueAuthenticatedAgents() {
        const unique = new Map();
        for (const agent of this.connectedAgents.values()) {
            if (agent.userId) {
                unique.set(agent.userId, {
                    id: agent.userId,
                    username: agent.username,
                    name: agent.name,
                    role: agent.role
                });
            }
        }
        return Array.from(unique.values());
    }

    broadcastAgentsList() {
        const agents = this.getUniqueAuthenticatedAgents();
        this.broadcast({ type: 'AGENTS_UPDATED', agents });
    }

    broadcastClaims() {
        this.broadcast({ type: 'CLAIMS_UPDATED', claims: Object.fromEntries(this.claimedChats) });
    }

    // Antes cada cambio reenviaba la cola ENTERA (~6 MB con 14.000 chats) a todos los asesores: eso era
    // el lag al marcar atendido. Ahora solo viajan los chats que cambiaron (QUEUE_DELTA); la cola
    // completa se manda al conectar (STATE) y cuando el cambio es muy grande.
    huellasDeCola(queue) {
        const huellas = new Map();
        for (const item of Array.isArray(queue) ? queue : []) {
            huellas.set(this.claveDeChat(item), JSON.stringify([item.name, item.preview, item.count, item.stage, item.attendedBy, item.time, item.leadPhone, item.account, item.isGroup, item.username]));
        }
        return huellas;
    }

    claveDeChat(item) {
        return item.chatKey || `${item.accountId}:${item.leadPhone || item.name}`;
    }

    // Base desde el arranque: asi hasta la primera accion viaja solo la diferencia, no la cola entera.
    // (Un asesor que se conecta despues recibe la cola actual en STATE; repetir un cambio es inocuo.)
    primeQueue(queue) {
        this.lastQueueMap = this.huellasDeCola(queue);
    }

    broadcastQueue(queue, force = false) {
        const safeQueue = Array.isArray(queue) ? queue : [];
        const claveDe = item => this.claveDeChat(item);
        const next = this.huellasDeCola(safeQueue);
        const prev = this.lastQueueMap;
        this.lastQueueMap = next;
        const claims = Object.fromEntries(this.claimedChats);
        if (!prev) {
            this.broadcast({ type: 'QUEUE_UPDATED', queue: safeQueue, claims });
            return;
        }
        const upsert = [];
        for (const item of safeQueue) {
            if (prev.get(claveDe(item)) !== next.get(claveDe(item))) upsert.push(item);
        }
        const remove = [];
        for (const clave of prev.keys()) {
            if (!next.has(clave)) remove.push(clave);
        }
        if (!upsert.length && !remove.length) return;
        if (upsert.length + remove.length > 500) {
            this.broadcast({ type: 'QUEUE_UPDATED', queue: safeQueue, claims });
            return;
        }
        this.broadcast({ type: 'QUEUE_DELTA', upsert, remove, claims });
    }

    broadcastAccounts(accounts) {
        this.broadcast({ type: 'ACCOUNTS_UPDATED', accounts });
    }
}

module.exports = MultiAgentServer;











