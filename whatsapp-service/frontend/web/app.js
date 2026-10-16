/**
 * CRM NETCONTACT - Cliente Web Multiagente
 * Tablero Kanban de 4 columnas, Chat en vivo sincronizado con WhatsApp Web
 */

// ==================== INTEGRACION CON KRONO ====================
// El panel corre dentro de Krono (mismo origen, bajo /wa/). No tiene login propio:
// usa el JWT de Krono guardado en sessionStorage (nc_token) y todas las rutas
// absolutas (/api, /media, websocket) se prefijan con /wa.
const WA_BASE = '/wa';
// Back Data abre el panel con ?sin-cuentas=1: la gestion de cuentas/QR solo se muestra en Jefatura
if (new URLSearchParams(window.location.search).has('sin-cuentas')) document.documentElement.classList.add('wa-sin-cuentas');
// Back Data muestra las salas internas (grupos "SALA ...") en recuadros flotantes: aqui no se listan
const ocultarSalas = new URLSearchParams(window.location.search).has('sin-salas');
const waNativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => waNativeFetch(typeof input === 'string' && input.startsWith('/') ? WA_BASE + input : input, init);
function waUrl(path) {
    return String(path || '').startsWith('/') ? WA_BASE + path : path;
}

// ==================== ESTADO GLOBAL ====================
const state = {
    token: sessionStorage.getItem('nc_token') || '',
    user: null,
    agentName: '',
    socket: null,
    queue: [],
    accounts: [],
    claims: {},
    activeChat: null,
    activeChatBandeja: null,
    activeChatBackdata: null,
    chatMessagesCache: new Map(),
    quickReplies: [],
    soundEnabled: localStorage.getItem('netcontact_sound') !== 'false',
    filter: 'all',
    accountFilter: 'all',
    searchQuery: '',
    viewMode: 'board',
    renderedMessageKeys: new Set(),
    // Scroll infinito (como Krono/Leads BP): cuantos chats se muestran por
    // columna/lista. Crece solo al hacer scroll cerca del final, no con botones.
    colVisible: {},
    activeChatMessages: [],
    activeChatDisplayedCount: 25,
    activeModule: 'bandeja'  // 'bandeja' | 'backdata'
};

// ==================== ELEMENTOS DOM ====================
// Autenticación & Perfil
const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const agentDisplayName = document.getElementById('agent-display-name');
const agentAvatar = document.getElementById('agent-avatar');
const agentRoleBadge = document.getElementById('agent-role-badge');
const btnLogout = document.getElementById('btn-logout');
const menuSalir = document.getElementById('menu-salir');
const crmAppRoot = document.getElementById('crm-app-root');

// Modales de Renombrar y Crear Cuenta WhatsApp
const renameModal = document.getElementById('rename-modal');
const renameAccountForm = document.getElementById('rename-account-form');
const renameAccountId = document.getElementById('rename-account-id');
const renameAccountInput = document.getElementById('rename-account-input');
const btnCloseRenameModal = document.getElementById('btn-close-rename-modal');
const btnCancelRenameModal = document.getElementById('btn-cancel-rename-modal');

const createAccountModal = document.getElementById('create-account-modal');
const createAccountForm = document.getElementById('create-account-form');
const createAccountTitle = document.getElementById('create-account-title');
const btnCloseCreateAccModal = document.getElementById('btn-close-create-acc-modal');
const btnCancelCreateAccModal = document.getElementById('btn-cancel-create-acc-modal');

const activeAccountBadge = document.getElementById('active-account-badge');


// Panel de Administración de Asesores
const btnAdminPanel = document.getElementById('btn-admin-panel');
const adminModal = document.getElementById('admin-modal');
const btnCloseAdminModal = document.getElementById('btn-close-admin-modal');
const adminUsersTableBody = document.getElementById('admin-users-table-body');
const btnOpenCreateAdvisor = document.getElementById('btn-open-create-advisor');
const advisorFormModal = document.getElementById('advisor-form-modal');
const advisorForm = document.getElementById('advisor-form');
const btnCloseAdvisorForm = document.getElementById('btn-close-advisor-form');
const btnCancelAdvisorForm = document.getElementById('btn-cancel-advisor-form');
const advisorModalTitle = document.getElementById('advisor-modal-title');
const advisorEditId = document.getElementById('advisor-edit-id');
const advisorName = document.getElementById('advisor-name');
const advisorUsername = document.getElementById('advisor-username');
const advisorPassword = document.getElementById('advisor-password');
const advisorPassHint = document.getElementById('advisor-pass-hint');
const advisorRole = document.getElementById('advisor-role');
const advisorFormError = document.getElementById('advisor-form-error');

// Panel de Cuentas WhatsApp
const btnAccountsPanel = document.getElementById('btn-accounts-panel');
const accountsModal = document.getElementById('accounts-modal');
const btnCloseAccountsModal = document.getElementById('btn-close-accounts-modal');
const accountsTableBody = document.getElementById('accounts-table-body');
const btnOpenCreateAccount = document.getElementById('btn-open-create-account');

// Modal de Código QR
const qrModal = document.getElementById('qr-modal');
const btnCloseQrModal = document.getElementById('btn-close-qr-modal');
const btnDoneQrModal = document.getElementById('btn-done-qr-modal');
const btnRefreshQrModal = document.getElementById('btn-refresh-qr-modal');
const qrModalTitle = document.getElementById('qr-modal-title');
const qrImage = document.getElementById('qr-image');
const qrLoadingText = document.getElementById('qr-loading-text');
const qrStatusInfo = document.getElementById('qr-status-info');
const qrInstructions = document.getElementById('qr-instructions');
const qrDisplayBox = document.getElementById('qr-display-box');
const btnTogglePairingMode = document.getElementById('btn-toggle-pairing-mode');
const pairingPhoneSection = document.getElementById('pairing-phone-section');
const pairingPhoneInput = document.getElementById('pairing-phone-input');
const btnRequestPairingCode = document.getElementById('btn-request-pairing-code');
const pairingCodeDisplay = document.getElementById('pairing-code-display');
const pairingCodeText = document.getElementById('pairing-code-text');
let qrPollingTimer = null;
let currentQrAccountId = null;
let pairingModeActive = false;

const connStatus = document.getElementById('conn-status');
const connText = document.getElementById('conn-text');
const agentsCount = document.getElementById('agents-count');
const btnSound = document.getElementById('btn-sound');

const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const accountFilterSelect = document.getElementById('account-filter');

const kpiMetricsRow = document.getElementById('kpi-metrics-row');
const kpiTotal = document.getElementById('kpi-total');
const kpiUnanswered = document.getElementById('kpi-unanswered');
const kpiBlacklist = document.getElementById('kpi-blacklist');
const kpiAttended = document.getElementById('kpi-attended');

const countUnansweredBadge = document.getElementById('count-unanswered-badge');
const countAll = document.getElementById('count-all');
const countUnanswered = document.getElementById('count-unanswered');
const countMine = document.getElementById('count-mine');

const badgeColUnanswered = document.getElementById('badge-col-unanswered');
const badgeColBlacklist = document.getElementById('badge-col-blacklist');
const badgeColAttended = document.getElementById('badge-col-attended');

const cardsColUnanswered = document.getElementById('cards-col-unanswered');
const cardsColBlacklist = document.getElementById('cards-col-blacklist');
const cardsColAttended = document.getElementById('cards-col-attended');

const footerColUnanswered = document.getElementById('footer-col-unanswered');
const footerColBlacklist = document.getElementById('footer-col-blacklist');
const footerColAttended = document.getElementById('footer-col-attended');
const footerSplitList = document.getElementById('footer-split-list');

const kanbanBoard = document.getElementById('kanban-board');
const splitListPanel = document.getElementById('split-list-panel');
const chatList = document.getElementById('chat-list');
const btnViewBoard = document.getElementById('btn-view-board');
const btnViewSplit = document.getElementById('btn-view-split');

// Back Data
const menuBackdata = document.getElementById('menu-backdata');
const menuBandeja = document.getElementById('menu-bandeja');
const backdataPanel = document.getElementById('backdata-panel');
const backdataList = document.getElementById('backdata-list');
const footerBackdataList = document.getElementById('footer-backdata-list');

// Chat Drawer
const activeChatPanel = document.getElementById('active-chat-panel');
const activeAvatar = document.getElementById('active-avatar');
const activeContactName = document.getElementById('active-contact-name');
const activePhoneDisplay = document.getElementById('active-phone-display');
const btnCopyPhone = document.getElementById('btn-copy-phone');
const activeWaitTime = document.getElementById('active-wait-time');
const collisionAlert = document.getElementById('collision-alert');
const claimedByName = document.getElementById('claimed-by-name');
const btnResolveChat = document.getElementById('btn-resolve-chat');
const btnCloseChat = document.getElementById('btn-close-chat');

const chatMessagesEl = document.getElementById('chat-messages');
const messagesLoadMoreWrap = document.getElementById('messages-load-more-wrap');
const btnLoadMoreMsgs = document.getElementById('btn-load-more-msgs');
const loadMoreCount = document.getElementById('load-more-count');
const messagesContainer = document.getElementById('messages-container');
const quickChips = document.getElementById('quick-chips');
const quickRepliesBar = document.getElementById('quick-replies-bar');
const composerForm = document.getElementById('composer-form');
const composerInput = document.getElementById('composer-input');

// ==================== AUTENTICACIÓN Y SESIONES ====================
async function checkAuth() {
    if (!state.token) {
        showLoginModal();
        return;
    }

    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (res.ok && (data.ok || data.success) && data.user) {
            setUserSession(data.user);
            hideLoginModal();
            connectWs();
        } else {
            showLoginModal();
        }
    } catch (err) {
        console.warn('[AUTH] Error verificando sesión:', err);
        showLoginModal();
    }
}

function showLoginModal() {
    state.token = '';
    state.user = null;
    state.agentName = '';
    localStorage.removeItem('netcontact_token');
    if (state.socket) {
        state.socket.onclose = null;
        try { state.socket.close(); } catch(e) {}
    }
    if (loginError) {
        loginError.textContent = '';
        loginError.classList.add('hidden');
    }
    if (loginPassword) loginPassword.value = '';

    // Cerrar cualquier modal que pudiera estar abierto
    if (adminModal) adminModal.classList.add('hidden');
    if (advisorFormModal) advisorFormModal.classList.add('hidden');
    if (accountsModal) accountsModal.classList.add('hidden');
    if (qrModal) qrModal.classList.add('hidden');
    if (renameModal) renameModal.classList.add('hidden');
    if (createAccountModal) createAccountModal.classList.add('hidden');
    if (activeChatPanel) activeChatPanel.classList.add('hidden');

    // Ocultar botones protegidos de admin
    if (btnAdminPanel) btnAdminPanel.classList.add('hidden');
    if (btnAccountsPanel) btnAccountsPanel.classList.add('hidden');
    if (agentDisplayName) agentDisplayName.textContent = 'Iniciar Sesión';
    if (agentRoleBadge) agentRoleBadge.textContent = '';

    if (crmAppRoot) crmAppRoot.classList.add('hidden');
    if (loginModal) loginModal.classList.remove('hidden');
    if (loginUsername) loginUsername.focus();
}

function hideLoginModal() {
    if (loginModal) loginModal.classList.add('hidden');
    if (crmAppRoot) crmAppRoot.classList.remove('hidden');
}

function setUserSession(user) {
    state.user = user;
    state.agentName = user.name || user.username;
    updateUserUI();
}

function updateUserUI() {
    if (!state.user) return;
    if (agentDisplayName) agentDisplayName.textContent = state.user.name || state.user.username;
    if (agentAvatar) {
        const initials = (state.user.name || state.user.username || 'US').trim().slice(0, 2).toUpperCase();
        agentAvatar.textContent = initials;
    }
    if (agentRoleBadge) {
        agentRoleBadge.textContent = state.user.role === 'admin' ? 'Admin' : 'Asesor';
        agentRoleBadge.className = `agent-role-badge role-${state.user.role}`;
    }
    if (btnAdminPanel) {
        if (state.user.role === 'admin') {
            btnAdminPanel.classList.remove('hidden');
        } else {
            btnAdminPanel.classList.add('hidden');
        }
    }
    if (btnAccountsPanel) {
        if (state.user.role === 'admin') {
            btnAccountsPanel.classList.remove('hidden');
        } else {
            btnAccountsPanel.classList.add('hidden');
        }
    }
    renderAlertaDesvinculadas();
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = loginUsername.value.trim();
        const password = loginPassword.value;
        if (!username || !password) return;

        loginError.classList.add('hidden');
        loginError.textContent = '';

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.ok && (data.ok || data.success) && data.token) {
                state.token = data.token;
                localStorage.setItem('netcontact_token', data.token);
                setUserSession(data.user);
                hideLoginModal();
                connectWs();
            } else {
                loginError.textContent = data.error || 'Usuario o contraseña incorrectos';
                loginError.classList.remove('hidden');
            }
        } catch (err) {
            loginError.textContent = 'Error de conexión con el servidor NetContact';
            loginError.classList.remove('hidden');
        }
    });
}

async function doLogout() {
    try {
        if (state.token) {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.token}` }
            });
        }
    } catch {}
    showLoginModal();
}

if (btnLogout) {
    btnLogout.addEventListener('click', (e) => {
        e.preventDefault();
        doLogout();
    });
}

if (menuSalir) {
    menuSalir.addEventListener('click', (e) => {
        e.preventDefault();
        doLogout();
    });
}

// ==================== PANEL DE ADMINISTRACIÓN ====================
if (btnAdminPanel) {
    btnAdminPanel.addEventListener('click', () => {
        openAdminModal();
    });
}

if (btnCloseAdminModal) {
    btnCloseAdminModal.addEventListener('click', () => {
        adminModal.classList.add('hidden');
    });
}

function openAdminModal() {
    if (adminModal) {
        adminModal.classList.remove('hidden');
        loadAdminUsers();
    }
}

async function loadAdminUsers() {
    if (!state.token || !adminUsersTableBody) return;
    try {
        const res = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (!res.ok || !(data.ok || data.success)) {
            console.error('[ADMIN] Error obteniendo usuarios:', data.error);
            return;
        }
        renderAdminUsersTable(data.users || []);
    } catch (err) {
        console.error('[ADMIN] Error cargando asesores:', err);
    }
}

function renderAdminUsersTable(users) {
    adminUsersTableBody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        const isMe = state.user && state.user.id === u.id;
        const onlineClass = u.isOnline ? 'online' : 'offline';
        const onlineText = u.isOnline ? `En línea (${u.activeSessions || 1})` : 'Desconectado';
        const statusBadgeClass = u.active ? 'status-active' : 'status-inactive';
        const statusText = u.active ? 'Activo' : 'Inactivo';

        tr.innerHTML = `
            <td>
                <div class="user-table-cell">
                    <div class="table-avatar">${(u.name || u.username).slice(0, 2).toUpperCase()}</div>
                    <span class="user-table-name">${escapeHtml(u.name || u.username)} ${isMe ? '<small class="text-me">(Tú)</small>' : ''}</span>
                </div>
            </td>
            <td><code>${escapeHtml(u.username)}</code></td>
            <td><span class="role-badge role-${u.role}">${u.role === 'admin' ? 'Administrador' : 'Asesor'}</span></td>
            <td>
                <span class="status-indicator">
                    <span class="indicator-dot ${onlineClass}"></span>
                    <span>${onlineText}</span>
                </span>
            </td>
            <td><span class="status-pill ${statusBadgeClass}">${statusText}</span></td>
            <td>
                <div class="table-actions">
                    ${u.isOnline && !isMe ? `
                        <button class="btn-action-sm btn-kick" data-action="kick" data-id="${u.id}" title="Cerrar remotamente su sesión ahora">
                            Expulsar
                        </button>
                    ` : ''}
                    <button class="btn-action-sm btn-edit" data-action="edit" data-id="${u.id}" title="Editar asesor o cambiar contraseña">
                        Editar
                    </button>
                    ${!isMe ? `
                        <button class="btn-action-sm btn-toggle ${u.active ? 'btn-deactivate' : 'btn-activate'}" data-action="toggle" data-id="${u.id}" title="${u.active ? 'Desactivar acceso' : 'Activar acceso'}">
                            ${u.active ? 'Desactivar' : 'Activar'}
                        </button>
                        <button class="btn-action-sm btn-delete" data-action="delete" data-id="${u.id}" title="Eliminar asesor">
                            ✕
                        </button>
                    ` : ''}
                </div>
            </td>
        `;
        adminUsersTableBody.appendChild(tr);
    });

    // Delegación de eventos para botones de la tabla
    adminUsersTableBody.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.getAttribute('data-action');
            const targetId = btn.getAttribute('data-id');
            const targetUser = users.find(u => u.id === targetId);

            if (action === 'kick') {
                if (confirm(`¿Cerrar remotamente la sesión de "${targetUser?.name || targetUser?.username}" inmediatamente?`)) {
                    await kickAdvisor(targetId);
                }
            } else if (action === 'toggle') {
                const actionVerb = targetUser?.active ? 'desactivar' : 'activar';
                if (confirm(`¿Deseas ${actionVerb} el acceso de "${targetUser?.name || targetUser?.username}"?`)) {
                    await toggleAdvisorActive(targetId);
                }
            } else if (action === 'edit') {
                openAdvisorEditModal(targetUser);
            } else if (action === 'delete') {
                if (confirm(`¿Eliminar definitivamente el usuario "${targetUser?.name || targetUser?.username}"?`)) {
                    await deleteAdvisor(targetId);
                }
            }
        });
    });
}

async function kickAdvisor(userId) {
    try {
        const res = await fetch(`/api/admin/users/${userId}/kick`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (res.ok && (data.ok || data.success)) {
            loadAdminUsers();
        } else {
            alert(data.error || 'Error al expulsar sesión');
        }
    } catch (err) {
        alert('Error de conexión al expulsar sesión');
    }
}

async function toggleAdvisorActive(userId) {
    try {
        const res = await fetch(`/api/admin/users/${userId}/toggle`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (res.ok && (data.ok || data.success)) {
            loadAdminUsers();
        } else {
            alert(data.error || 'Error al cambiar estado del asesor');
        }
    } catch (err) {
        alert('Error de conexión');
    }
}

async function deleteAdvisor(userId) {
    try {
        const res = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (res.ok && (data.ok || data.success)) {
            loadAdminUsers();
        } else {
            alert(data.error || 'Error al eliminar usuario');
        }
    } catch (err) {
        alert('Error de conexión');
    }
}

// Modal Formulario Asesor (Crear / Editar)
if (btnOpenCreateAdvisor) {
    btnOpenCreateAdvisor.addEventListener('click', () => {
        openAdvisorCreateModal();
    });
}

if (btnCloseAdvisorForm) {
    btnCloseAdvisorForm.addEventListener('click', () => {
        advisorFormModal.classList.add('hidden');
    });
}

if (btnCancelAdvisorForm) {
    btnCancelAdvisorForm.addEventListener('click', () => {
        advisorFormModal.classList.add('hidden');
    });
}

function openAdvisorCreateModal() {
    advisorEditId.value = '';
    advisorModalTitle.textContent = 'Crear Nuevo Asesor';
    advisorName.value = '';
    advisorUsername.value = '';
    advisorUsername.disabled = false;
    advisorPassword.value = '';
    advisorPassword.required = true;
    advisorPassHint.textContent = '(Mínimo 6 caracteres)';
    advisorRole.value = 'asesor';
    advisorFormError.classList.add('hidden');
    advisorFormError.textContent = '';
    advisorFormModal.classList.remove('hidden');
    advisorName.focus();
}

function openAdvisorEditModal(user) {
    if (!user) return;
    advisorEditId.value = user.id;
    advisorModalTitle.textContent = `Editar Asesor: ${user.name || user.username}`;
    advisorName.value = user.name || '';
    advisorUsername.value = user.username || '';
    advisorUsername.disabled = true; // No modificar username
    advisorPassword.value = '';
    advisorPassword.required = false;
    advisorPassHint.textContent = '(Dejar en blanco para mantener la contraseña actual)';
    advisorRole.value = user.role || 'asesor';
    advisorFormError.classList.add('hidden');
    advisorFormError.textContent = '';
    advisorFormModal.classList.remove('hidden');
    advisorName.focus();
}

if (advisorForm) {
    advisorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = advisorEditId.value;
        const name = advisorName.value.trim();
        const username = advisorUsername.value.trim();
        const password = advisorPassword.value;
        const role = advisorRole.value;

        if (!name) return;
        if (!editId && (!username || !password)) {
            advisorFormError.textContent = 'Todos los campos son requeridos.';
            advisorFormError.classList.remove('hidden');
            return;
        }

        advisorFormError.classList.add('hidden');

        try {
            let res;
            if (editId) {
                // Actualizar
                const body = { name, role };
                if (password) body.password = password;
                res = await fetch(`/api/admin/users/${editId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${state.token}`
                    },
                    body: JSON.stringify(body)
                });
            } else {
                // Crear
                res = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${state.token}`
                    },
                    body: JSON.stringify({ name, username, password, role })
                });
            }

            const data = await res.json();
            if (res.ok && (data.ok || data.success)) {
                advisorFormModal.classList.add('hidden');
                loadAdminUsers();
            } else {
                advisorFormError.textContent = data.error || 'Error al guardar asesor';
                advisorFormError.classList.remove('hidden');
            }
        } catch (err) {
            advisorFormError.textContent = 'Error de conexión con el servidor';
            advisorFormError.classList.remove('hidden');
        }
    });
}

// ==================== PANEL DE CUENTAS WHATSAPP ====================
if (btnAccountsPanel) {
    btnAccountsPanel.addEventListener('click', () => {
        openAccountsModal();
    });
}

if (btnCloseAccountsModal) {
    btnCloseAccountsModal.addEventListener('click', () => {
        accountsModal.classList.add('hidden');
    });
}

function openAccountsModal() {
    if (accountsModal) {
        accountsModal.classList.remove('hidden');
        loadAccountsList();
    }
}

// Firma de lo que se ve en la tabla: si no cambio nada, no se vuelve a dibujar.
let accountsSig = '';
let accountsRefreshTimer = null;

// El servidor avisa cada cambio de estado de una cuenta (conectando, QR listo, QR renovado...).
// Se juntan en una sola actualizacion para que el recuadro no parpadee.
function scheduleAccountsRefresh() {
    if (accountsRefreshTimer) return;
    accountsRefreshTimer = setTimeout(() => {
        accountsRefreshTimer = null;
        loadAccountsList();
    }, 500);
}

async function loadAccountsList() {
    if (!state.token || !accountsTableBody) return;
    try {
        // "Cargando" solo si la tabla esta vacia; si ya hay filas se actualiza en silencio
        // (antes se borraba la tabla en cada aviso y el recuadro se encogia y crecia).
        if (!accountsTableBody.children.length) {
            accountsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">Cargando estado de las cuentas WhatsApp...</td></tr>';
        }
        const res = await fetch('/api/admin/accounts', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (!res.ok || !(data.ok || data.success)) {
            accountsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ef4444; padding: 20px;">Error cargando cuentas WhatsApp</td></tr>';
            accountsSig = '';
            return;
        }
        const accounts = data.accounts || [];
        const sig = JSON.stringify(accounts.map(a => [a.id, a.title, a.module, a.status, Boolean(a.hasQr), a.desvinculada?.at || 0]));
        const hayFilas = accountsTableBody.querySelector('button[data-action]');
        if (sig === accountsSig && hayFilas) return; // nada cambio: no se toca la tabla
        accountsSig = sig;
        renderAccountsTable(accounts);
    } catch (err) {
        console.error('[ACCOUNTS] Error:', err);
    }
}

function renderAccountsTable(accounts) {
    accountsTableBody.innerHTML = '';
    if (accounts.length === 0) {
        accountsTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">No hay cuentas registradas. Haz clic en "+ Conectar Nueva Línea".</td></tr>';
        return;
    }

    accounts.forEach(acc => {
        const tr = document.createElement('tr');
        const isConnected = acc.status === 'connected';
        const isQrReady = acc.status === 'qr_ready' || acc.hasQr;
        
        let statusBadge = '';
        if (acc.desvinculada && !isConnected && !isQrReady) {
            statusBadge = `
                <span class="status-indicator" title="${escapeHtml(acc.desvinculada.motivo || '')}">
                    <span class="indicator-dot" style="background: #dc2626; box-shadow: 0 0 8px rgba(220, 38, 38, 0.6);"></span>
                    <span style="color: #dc2626; font-weight: 700;">Desvinculada · ${escapeHtml(formatoFechaAlerta(acc.desvinculada.at))}</span>
                </span>
            `;
        } else if (isConnected) {
            statusBadge = `
                <span class="status-indicator">
                    <span class="indicator-dot online"></span>
                    <span style="color: #16a34a; font-weight: 600;">Conectada (WhatsApp Web Activo)</span>
                </span>
            `;
        } else if (isQrReady) {
            statusBadge = `
                <span class="status-indicator">
                    <span class="indicator-dot" style="background: #eab308; box-shadow: 0 0 8px rgba(234, 179, 8, 0.6);"></span>
                    <span style="color: #ca8a04; font-weight: 600;">Esperando Escaneo de QR</span>
                </span>
            `;
        } else {
            statusBadge = `
                <span class="status-indicator">
                    <span class="indicator-dot offline"></span>
                    <span style="color: #94a3b8;">Iniciando / En espera</span>
                </span>
            `;
        }

        const modBadge = acc.module === 'backdata'
            ? `<span class="badge" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;white-space:nowrap;">Back Data</span>`
            : `<span class="badge" style="background:#e0f2fe;color:#0284c7;border:1px solid #bae6fd;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;white-space:nowrap;">Bandeja</span>`;

        tr.innerHTML = `
            <td><strong>${escapeHtml(acc.title || acc.id)}</strong></td>
            <td><code>${escapeHtml(acc.id)}</code></td>
            <td>${modBadge}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-action-sm btn-primary" data-action="qr" data-id="${acc.id}" data-title="${escapeHtml(acc.title || acc.id)}" title="Ver código QR para vincular teléfono">
                        Escanear QR
                    </button>
                    <button class="btn-action-sm btn-secondary" data-action="pairing" data-id="${acc.id}" data-title="${escapeHtml(acc.title || acc.id)}" title="Vincular escribiendo un código en vez de escanear (util si falla la cámara)">
                        Vincular por código
                    </button>
                    <button class="btn-action-sm btn-edit" data-action="rename" data-id="${acc.id}" data-title="${escapeHtml(acc.title || acc.id)}" data-module="${acc.module || 'bandeja'}" title="Cambiar nombre y módulo de la línea">
                        Editar
                    </button>
                    <button class="btn-action-sm btn-toggle btn-deactivate" data-action="reset" data-id="${acc.id}" title="Reiniciar sesión y generar nuevo QR">
                        Reiniciar QR
                    </button>
                    <button class="btn-action-sm btn-delete" data-action="delete" data-id="${acc.id}" title="Eliminar línea">
                        ✕
                    </button>
                </div>
            </td>
        `;
        accountsTableBody.appendChild(tr);
    });

    // Delegación de eventos para botones
    accountsTableBody.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.getAttribute('data-action');
            const targetId = btn.getAttribute('data-id');
            const targetTitle = btn.getAttribute('data-title');
            const targetModule = btn.getAttribute('data-module') || 'bandeja';

            if (action === 'qr') {
                openQrModal(targetId, targetTitle);
            } else if (action === 'pairing') {
                openQrModal(targetId, targetTitle, true);
            } else if (action === 'reset') {
                if (confirm(`¿Deseas reiniciar la sesión de WhatsApp para "${targetTitle}"? Se cerrará la sesión actual y se generará un nuevo QR.`)) {
                    await resetAccountSession(targetId);
                }
            } else if (action === 'rename') {
                openRenameModal(targetId, targetTitle, targetModule);
            } else if (action === 'delete') {
                if (confirm(`¿Eliminar la línea "${targetTitle}"? Esta acción no se puede deshacer.`)) {
                    await deleteAccount(targetId);
                }
            }
        });
    });
}

function openRenameModal(id, currentTitle, currentModule) {
    if (!renameModal) return;
    renameAccountId.value = id;
    renameAccountInput.value = currentTitle || '';
    const moduleSelect = document.getElementById('rename-account-module');
    if (moduleSelect) moduleSelect.value = currentModule || 'bandeja';
    renameModal.classList.remove('hidden');
    setTimeout(() => {
        if (renameAccountInput) {
            renameAccountInput.focus();
            renameAccountInput.select();
        }
    }, 50);
}

if (btnCloseRenameModal) {
    btnCloseRenameModal.addEventListener('click', () => {
        renameModal.classList.add('hidden');
    });
}

if (btnCancelRenameModal) {
    btnCancelRenameModal.addEventListener('click', () => {
        renameModal.classList.add('hidden');
    });
}

if (renameAccountForm) {
    renameAccountForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const accountId = renameAccountId.value;
        const newTitle = renameAccountInput.value.trim();
        const moduleSelect = document.getElementById('rename-account-module');
        const newModule = moduleSelect ? moduleSelect.value : 'bandeja';
        if (!accountId || !newTitle) return;
        renameModal.classList.add('hidden');
        await renameAccount(accountId, newTitle, newModule);
    });
}

function openCreateAccountModal() {
    if (!createAccountModal) return;
    createAccountTitle.value = '';
    createAccountModal.classList.remove('hidden');
    setTimeout(() => {
        if (createAccountTitle) createAccountTitle.focus();
    }, 50);
}

if (btnOpenCreateAccount) {
    btnOpenCreateAccount.addEventListener('click', (e) => {
        e.preventDefault();
        openCreateAccountModal();
    });
}

if (btnCloseCreateAccModal) {
    btnCloseCreateAccModal.addEventListener('click', () => {
        createAccountModal.classList.add('hidden');
    });
}

if (btnCancelCreateAccModal) {
    btnCancelCreateAccModal.addEventListener('click', () => {
        createAccountModal.classList.add('hidden');
    });
}

if (createAccountForm) {
    createAccountForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = createAccountTitle.value.trim();
        const moduleSelect = document.getElementById('create-account-module');
        const module = moduleSelect ? moduleSelect.value : 'bandeja';
        if (!title) return;
        createAccountModal.classList.add('hidden');
        await createAccount(title, module);
    });
}

async function createAccount(title, module = 'bandeja') {
    try {
        const res = await fetch('/api/admin/accounts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ title, module })
        });
        const data = await res.json();
        if (res.ok && (data.ok || data.success)) {
            loadAccountsList();
            if (data.account?.id) {
                setTimeout(() => openQrModal(data.account.id, data.account.title || title), 1000);
            }
        } else {
            alert(data.error || 'Error al crear cuenta');
        }
    } catch {
        alert('Error de conexión con el servidor');
    }
}

async function resetAccountSession(accountId) {
    try {
        const res = await fetch(`/api/admin/accounts/${accountId}/reset`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (res.ok && (data.ok || data.success)) {
            alert('Sesión reiniciada. Se está generando el nuevo código QR.');
            loadAccountsList();
        } else {
            alert(data.error || 'Error al reiniciar sesión');
        }
    } catch {
        alert('Error de conexión');
    }
}

async function renameAccount(accountId, title, module = 'bandeja') {
    try {
        const res = await fetch(`/api/admin/accounts/${accountId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ title, module })
        });
        const data = await res.json();
        if (res.ok && (data.ok || data.success)) {
            loadAccountsList();
        } else {
            alert(data.error || 'Error al renombrar cuenta');
        }
    } catch {
        alert('Error de conexión');
    }
}

async function deleteAccount(accountId) {
    try {
        const res = await fetch(`/api/admin/accounts/${accountId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (res.ok && (data.ok || data.success)) {
            loadAccountsList();
        } else {
            alert(data.error || 'Error al eliminar cuenta');
        }
    } catch {
        alert('Error de conexión');
    }
}

// Modal QR
function openQrModal(accountId, title, startInPairingMode) {
    currentQrAccountId = accountId;
    qrModalTitle.textContent = `Vincular: ${title || accountId}`;
    qrImage.classList.add('hidden');
    qrLoadingText.classList.remove('hidden');
    qrLoadingText.textContent = 'Obteniendo código QR de WhatsApp Web...';
    qrStatusInfo.textContent = 'Conectando con WhatsApp Web...';
    pairingCodeDisplay.classList.add('hidden');
    qrModal.classList.remove('hidden');

    if (startInPairingMode) {
        enterPairingMode();
    } else {
        exitPairingMode(false);
        fetchAccountQr(accountId);
    }

    if (qrPollingTimer) clearInterval(qrPollingTimer);
    // Vinculo por codigo: WhatsApp a veces corta la conexion y el servidor pide
    // un codigo nuevo casi al toque, asi que se consulta seguido para que el
    // panel muestre siempre el codigo mas reciente (el viejo deja de servir).
    qrPollingTimer = setInterval(() => {
        if (!qrModal.classList.contains('hidden') && currentQrAccountId === accountId) {
            fetchAccountQr(accountId);
        } else {
            clearInterval(qrPollingTimer);
        }
    }, 1500);
}

function closeQrModal() {
    if (qrPollingTimer) clearInterval(qrPollingTimer);
    qrPollingTimer = null;
    currentQrAccountId = null;
    qrModal.classList.add('hidden');
    exitPairingMode(false);
    loadAccountsList();
}

if (btnCloseQrModal) btnCloseQrModal.addEventListener('click', closeQrModal);
if (btnDoneQrModal) btnDoneQrModal.addEventListener('click', closeQrModal);
if (btnRefreshQrModal) {
    btnRefreshQrModal.addEventListener('click', () => {
        if (currentQrAccountId) fetchAccountQr(currentQrAccountId);
    });
}

// ---- Vinculo por codigo (sin camara) ----
function enterPairingMode() {
    pairingModeActive = true;
    qrDisplayBox.classList.add('hidden');
    qrInstructions.classList.add('hidden');
    pairingCodeDisplay.classList.add('hidden');
    pairingPhoneSection.classList.remove('hidden');
    if (pairingPhoneInput) { pairingPhoneInput.value = ''; pairingPhoneInput.focus(); }
    if (btnRequestPairingCode) { btnRequestPairingCode.disabled = false; btnRequestPairingCode.textContent = 'Pedir código'; }
    if (btnTogglePairingMode) btnTogglePairingMode.textContent = 'Volver a código QR';
    qrStatusInfo.textContent = 'Escribe el número de WhatsApp a vincular';
    qrStatusInfo.style.color = '#0284c7';
}

function exitPairingMode(refresh) {
    pairingModeActive = false;
    qrDisplayBox.classList.remove('hidden');
    qrInstructions.classList.remove('hidden');
    pairingPhoneSection.classList.add('hidden');
    pairingCodeDisplay.classList.add('hidden');
    if (btnTogglePairingMode) btnTogglePairingMode.textContent = '¿Falla la cámara? Vincular con código';
    if (refresh && currentQrAccountId) fetchAccountQr(currentQrAccountId);
}

if (btnTogglePairingMode) {
    btnTogglePairingMode.addEventListener('click', () => {
        if (pairingModeActive) exitPairingMode(true);
        else enterPairingMode();
    });
}

if (btnRequestPairingCode) {
    btnRequestPairingCode.addEventListener('click', async () => {
        const phone = (pairingPhoneInput?.value || '').replace(/\D/g, '');
        if (!phone || phone.length < 8) {
            alert('Ingresa un número de WhatsApp válido, con código de país (ej. 51987654321).');
            return;
        }
        if (!currentQrAccountId) return;
        btnRequestPairingCode.disabled = true;
        btnRequestPairingCode.textContent = 'Generando código...';
        try {
            const res = await fetch(`/api/admin/accounts/${currentQrAccountId}/pairing-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
                body: JSON.stringify({ phone })
            });
            const data = await res.json();
            if (res.ok && (data.ok || data.success)) {
                qrStatusInfo.textContent = 'Generando código, un momento...';
                fetchAccountQr(currentQrAccountId);
            } else {
                alert(data.error || 'No se pudo pedir el código. Intenta de nuevo.');
                btnRequestPairingCode.disabled = false;
                btnRequestPairingCode.textContent = 'Pedir código';
            }
        } catch {
            alert('Error de conexión');
            btnRequestPairingCode.disabled = false;
            btnRequestPairingCode.textContent = 'Pedir código';
        }
    });
}

async function fetchAccountQr(accountId) {
    try {
        const res = await fetch(`/api/admin/accounts/${accountId}/qr`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (res.ok && (data.ok || data.success)) {
            if (data.status === 'connected') {
                pairingPhoneSection.classList.add('hidden');
                pairingCodeDisplay.classList.add('hidden');
                qrDisplayBox.classList.remove('hidden');
                qrLoadingText.classList.remove('hidden');
                qrLoadingText.innerHTML = '<span style="color: #16a34a; font-weight: 700; font-size: 16px;">✓ ¡Cuenta vinculada con éxito!</span><br><small style="color: #64748b;">WhatsApp Web está conectado y listo para recibir chats.</small>';
                qrImage.classList.add('hidden');
                qrStatusInfo.textContent = 'Sesión activa y sincronizada';
                qrStatusInfo.style.color = '#16a34a';
                return;
            }

            if (data.status === 'pairing_code_ready' && data.pairingCode) {
                pairingPhoneSection.classList.add('hidden');
                qrDisplayBox.classList.add('hidden');
                qrInstructions.classList.add('hidden');
                pairingCodeDisplay.classList.remove('hidden');
                const code = String(data.pairingCode).toUpperCase();
                pairingCodeText.textContent = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
                qrStatusInfo.textContent = 'Ingresa este código en tu celular AHORA (puede refrescarse solo cada pocos segundos)';
                qrStatusInfo.style.color = '#0284c7';
                return;
            }

            if (pairingModeActive) return; // esperando que se pida el codigo, no pisar con el QR

            if (data.qrData) {
                qrLoadingText.classList.add('hidden');
                qrImage.src = data.qrData;
                qrImage.classList.remove('hidden');
                qrStatusInfo.textContent = ''; // sin texto: el QR se explica solo (el recuadro se oculta cuando esta vacio)
                qrStatusInfo.style.color = '#0284c7';
            } else {
                qrLoadingText.classList.remove('hidden');
                qrLoadingText.textContent = 'Iniciando WhatsApp Web, el QR aparecerá en unos segundos...';
                qrImage.classList.add('hidden');
            }
        }
    } catch (err) {
        console.warn('[QR] Error obteniendo QR:', err);
    }
}

// ==================== ALERTA DE LINEAS DESVINCULADAS ====================
// Solo para Jefatura (admin y con el boton de cuentas): una barra roja con cada linea que WhatsApp
// desvinculo sola. Desaparece sola cuando la linea se vuelve a vincular.
function formatoFechaAlerta(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const hoy = new Date();
    const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === hoy.toDateString() ? `hoy ${hora}` : `${d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })} ${hora}`;
}

var alertasVistas = null; // ids ya avisados con sonido en esta pestaña (var: se puede llamar antes de esta linea)
function renderAlertaDesvinculadas() {
    const caja = document.getElementById('alerta-desvinculadas');
    if (!caja) return;
    // Jefatura y Backoffice ven la alerta; el boton "Volver a vincular" solo Jefatura (Backoffice no gestiona cuentas)
    const puedeVincular = state.user?.role === 'admin' && !document.documentElement.classList.contains('wa-sin-cuentas');
    const lista = state.user ? (state.accounts || []).filter(a => a.desvinculada) : [];
    if (!lista.length) {
        caja.classList.add('hidden');
        caja.innerHTML = '';
        return;
    }
    const nuevas = lista.filter(a => !(alertasVistas || new Set()).has(`${a.id}|${a.desvinculada.at}`));
    if (alertasVistas && nuevas.length) playChime();
    alertasVistas = new Set(lista.map(a => `${a.id}|${a.desvinculada.at}`));

    caja.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div class="alerta-desv-texto">
            <strong>${lista.length === 1 ? 'Se desvinculó una línea de WhatsApp' : `Se desvincularon ${lista.length} líneas de WhatsApp`}</strong>
            <span>${lista.map(a => `<b>${escapeHtml(a.title || a.id)}</b> (${escapeHtml(formatoFechaAlerta(a.desvinculada.at))})`).join(' · ')} — no recibe ni envía mensajes hasta volver a vincularla${puedeVincular ? '' : ' (avisar a Jefatura)'}.</span>
        </div>
        ${puedeVincular ? '<button type="button" class="alerta-desv-btn" id="alerta-desv-vincular">Volver a vincular</button>' : ''}
    `;
    caja.classList.remove('hidden');
    document.getElementById('alerta-desv-vincular')?.addEventListener('click', openAccountsModal);
}

// ==================== SONIDO DE NOTIFICACIÓN ====================
const audioCtx = typeof AudioContext !== 'undefined' ? new (window.AudioContext || window.webkitAudioContext)() : null;
function playChime() {
    if (!state.soundEnabled || !audioCtx) return;
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    } catch {}
}

btnSound.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('netcontact_sound', state.soundEnabled);
    btnSound.style.opacity = state.soundEnabled ? '1' : '0.4';
});

// ==================== WEBSOCKET ====================
function connectWs() {
    if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) {
        return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${WA_BASE}/ws`;
    state.socket = new WebSocket(wsUrl);

    state.socket.onopen = () => {
        connStatus.classList.remove('offline');
        connStatus.classList.add('online');
        connText.textContent = 'En línea';
        if (state.token) {
            state.socket.send(JSON.stringify({ type: 'AUTH', token: state.token }));
        } else if (state.agentName) {
            state.socket.send(JSON.stringify({ type: 'AGENT_JOIN', name: state.agentName }));
        }
    };

    state.socket.onclose = () => {
        connStatus.classList.remove('online');
        connStatus.classList.add('offline');
        connText.textContent = 'Reconectando...';
        setTimeout(connectWs, 2000);
    };

    state.socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleServerEvent(data);
        } catch (err) {
            console.error('[WS] Error parseando datos:', err);
        }
    };
}

function handleServerEvent(event) {
    switch (event.type) {
        case 'STATE':
        case 'INIT':
            state.accounts = event.accounts || [];
            renderAlertaDesvinculadas();
            state.queue = event.queue || [];
            if (state.activeChat) {
                const activeKey = getChatKey(state.activeChat);
                const activeItem = state.queue.find(it => getChatKey(it) === activeKey);
                if (activeItem) activeItem.count = 0;
            }
            state.claims = event.claims || {};
            state.quickReplies = event.quickReplies || [];
            state.agents = event.agents || [];
            updateAccountsDropdown();
            renderQuickReplies();
            renderAll();
            updateAgentsOnline();
            break;

        case 'QUEUE_DELTA': {
            // Cambios sueltos: se aplican sobre la cola que ya tenemos (no se reenvia entera)
            const claveDe = it => it.chatKey || `${it.accountId}:${it.leadPhone || it.name}`;
            const prevCount = state.queue.length;
            const mapa = new Map(state.queue.map(it => [claveDe(it), it]));
            for (const clave of event.remove || []) mapa.delete(clave);
            for (const it of event.upsert || []) mapa.set(claveDe(it), it);
            state.queue = [...mapa.values()];
            if (state.activeChat) {
                const activeKey = state.activeChat.chatKey || getChatKey(state.activeChat);
                const activeItem = state.queue.find(it => (it.chatKey || getChatKey(it)) === activeKey);
                if (activeItem) activeItem.count = 0;
            }
            state.claims = event.claims || state.claims;
            if (state.queue.length > prevCount) {
                playChime();
            }
            renderAll();
            break;
        }

        case 'QUEUE_UPDATED': {
            const prevCount = state.queue.length;
            state.queue = event.queue || [];
            if (state.activeChat) {
                const activeKey = getChatKey(state.activeChat);
                const activeItem = state.queue.find(it => getChatKey(it) === activeKey);
                if (activeItem) activeItem.count = 0;
            }
            state.claims = event.claims || state.claims;
            if (state.queue.length > prevCount) {
                playChime();
            }
            renderAll();
            break;
        }

        case 'CLAIMS_UPDATED':
            state.claims = event.claims || {};
            renderAll();
            updateCollisionBanner();
            break;

        case 'FORCE_LOGOUT':
            alert(event.reason || 'Tu sesión ha sido cerrada por el administrador.');
            showLoginModal();
            break;

        case 'AGENTS_UPDATED':
            state.agents = event.agents || [];
            updateAgentsOnline();
            if (adminModal && !adminModal.classList.contains('hidden')) {
                loadAdminUsers();
            }
            break;

        case 'ACCOUNTS_UPDATED':
            state.accounts = event.accounts || [];
            renderAlertaDesvinculadas();
            updateAccountsDropdown();
            renderAll();
            if (accountsModal && !accountsModal.classList.contains('hidden')) {
                scheduleAccountsRefresh();
            }
            break;

        case 'MESSAGE_ADDED':
            if (state.activeChat) {
                const currentKey = `${state.activeChat.accountId}:${state.activeChat.leadPhone || state.activeChat.name}`;
                if (currentKey === event.chatKey) {
                    if (!state.activeChatMessages) state.activeChatMessages = [];
                    const exists = state.activeChatMessages.some(m => m.id === event.message.id || (m.fromAgent === event.message.fromAgent && m.text === event.message.text && Math.abs((Number(m.time) || 0) - (Number(event.message.time) || 0)) < 30000));
                    if (!exists) {
                        state.activeChatMessages.push(event.message);
                    }
                    appendMessageBubble(event.message);

                    const qItem = (state.queue || []).find(it => getChatKey(it) === getChatKey(state.activeChat));
                    if (qItem) qItem.count = 0;
                    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
                        state.socket.send(JSON.stringify({
                            type: 'MARK_CHAT_READ',
                            chatKey: state.activeChat.chatKey,
                            accountId: state.activeChat.accountId,
                            phone: state.activeChat.leadPhone || state.activeChat.phone,
                            name: state.activeChat.name
                        }));
                    }
                }
            }
            break;

        case 'MESSAGE_STATUS':
            if (state.activeChat) {
                updateMessageBubbleStatus(event.messageId, event.status, event.errorReason);
            }
            break;

        case 'CHAT_HISTORY':
            if (!state.chatMessagesCache) state.chatMessagesCache = new Map();
            state.chatMessagesCache.set(event.chatKey, event.messages || []);
            if (state.activeChat) {
                if (event.avatarUrl && activeAvatar) {
                    state.activeChat.avatarUrl = event.avatarUrl;
                    const initials = (state.activeChat.name || 'NC').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'NC';
                    activeAvatar.innerHTML = `<img src="${escapeHtml(event.avatarUrl)}" class="header-avatar-img" alt="" onerror="this.parentElement.textContent='${initials}'" />`;
                }

                if (event.name && !/^\d{13,20}$/.test(event.name) && event.name !== state.activeChat.name) {
                    state.activeChat.name = event.name;
                    if (activeContactName) activeContactName.textContent = event.name;
                    const initials = event.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'UW';
                    if (activeAvatar && !state.activeChat.avatarUrl) {
                        activeAvatar.textContent = initials;
                    }
                    const qItem = (state.queue || []).find(it => getChatKey(it) === getChatKey(state.activeChat));
                    if (qItem) qItem.name = event.name;
                    renderAll();
                }

                if (event.phone) {
                    state.activeChat.leadPhone = event.phone;
                    state.activeChat.phone = event.phone;
                    const formatted = formatPhoneNumber(event.phone);
                    if (activePhoneDisplay) activePhoneDisplay.textContent = formatted;
                    
                    const found = state.queue.find(q => q.accountId === state.activeChat.accountId && (q.name === state.activeChat.name || (q.leadPhone && q.leadPhone === event.phone)));
                    if (found) {
                        found.leadPhone = event.phone;
                        found.phone = event.phone;
                        found.leadPhoneDisplay = formatted;
                    }
                }

                // Renderizar los mensajes del historial directamente
                renderMessageHistory(event.messages);
            }
            break;
    }
}

function updateAgentsOnline() {
    const count = (state.agents && state.agents.length) || 1;
    agentsCount.textContent = count === 1 ? '1 asesor' : `${count} asesores`;
}

function updateAccountsDropdown() {
    if (!accountFilterSelect) return;
    const currentVal = accountFilterSelect.value;
    accountFilterSelect.innerHTML = '<option value="all">MÓVILES (Todas las cuentas)</option>';
    state.accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = acc.title || acc.id;
        accountFilterSelect.appendChild(opt);
    });
    if (state.accounts.some(a => a.id === currentVal)) {
        accountFilterSelect.value = currentVal;
    }
}

function resetPagination() {
    state.colVisible = {};
}

if (accountFilterSelect) {
    accountFilterSelect.addEventListener('change', () => {
        state.accountFilter = accountFilterSelect.value;
        resetPagination();
        renderAll();
    });
}

// ==================== BÚSQUEDA Y FILTROS ====================
searchInput.addEventListener('input', () => {
    state.searchQuery = searchInput.value.trim().toLowerCase();
    searchClear.classList.toggle('hidden', !state.searchQuery);
    resetPagination();
    renderAll();
});

searchClear.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    searchClear.classList.add('hidden');
    resetPagination();
    renderAll();
});

document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        // "Todos" va oculto en Krono: volver a pulsar el filtro activo regresa a todos los chats
        if (pill.classList.contains('active') && pill.dataset.filter !== 'all') {
            pill = document.querySelector('.filter-pill[data-filter="all"]') || pill;
        }
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.filter = pill.dataset.filter;
        resetPagination();
        renderAll();
    });
});

const filterUnreadBtn = document.getElementById('filter-unread-btn');
if (filterUnreadBtn) {
    filterUnreadBtn.addEventListener('click', () => {
        state.filter = state.filter === 'unanswered' ? 'all' : 'unanswered';
        filterUnreadBtn.style.borderColor = state.filter === 'unanswered' ? 'var(--brand-red)' : '';
        resetPagination();
        renderAll();
    });
}

btnViewBoard.addEventListener('click', () => {
    state.viewMode = 'board';
    btnViewBoard.classList.add('active');
    btnViewSplit.classList.remove('active');
    kanbanBoard.classList.remove('hidden');
    splitListPanel.classList.add('hidden');
});

btnViewSplit.addEventListener('click', () => {
    state.viewMode = 'split';
    btnViewSplit.classList.add('active');
    btnViewBoard.classList.remove('active');
    kanbanBoard.classList.add('hidden');
    splitListPanel.classList.remove('hidden');
    renderSplitList();
});

function isBackdataItem(item) {
    if (!item) return false;
    if (item.module === 'backdata') return true;
    const acc = (state.accounts || []).find(a => a.id === item.accountId);
    return Boolean(acc && acc.module === 'backdata');
}

// ==================== NAVEGACIÓN MÓDULOS ====================
function activarModuloBandeja() {
    state.activeModule = 'bandeja';
    document.body.classList.remove('module-backdata');
    document.body.classList.add('module-bandeja');
    if (menuBandeja) menuBandeja.classList.add('active');
    if (menuBackdata) menuBackdata.classList.remove('active');
    // Mostrar controles de bandeja, ocultar backdata
    if (backdataPanel) backdataPanel.classList.add('hidden');
    const viewModeToggle = document.getElementById('view-mode-toggle');
    const filterPills = document.getElementById('filter-pills');
    const headerTag = document.getElementById('header-tag');
    const headerTitle = document.getElementById('header-title');
    const headerDesc = document.getElementById('header-desc');
    if (viewModeToggle) viewModeToggle.classList.remove('hidden');
    if (filterPills) filterPills.classList.remove('hidden');
    if (kpiMetricsRow) kpiMetricsRow.classList.remove('hidden');
    if (headerTag) headerTag.textContent = 'BANDEJA';
    if (headerTitle) headerTitle.textContent = 'Bandeja de conversaciones';
    if (headerDesc) headerDesc.textContent = 'Gestiona y da seguimiento a tus conversaciones en tiempo real.';
    // Mostrar vista activa de bandeja
    if (state.viewMode === 'board') {
        kanbanBoard.classList.remove('hidden');
        splitListPanel.classList.add('hidden');
    } else {
        kanbanBoard.classList.add('hidden');
        splitListPanel.classList.remove('hidden');
    }
    // El chat de Back Data NUNCA se muestra en Bandeja
    if (state.activeChatBandeja) {
        selectChat(state.activeChatBandeja);
    } else {
        state.activeChat = null;
        if (activeChatPanel) activeChatPanel.classList.add('hidden');
    }
    renderAll();
}

function activarModuloBackdata() {
    state.activeModule = 'backdata';
    document.body.classList.add('module-backdata');
    document.body.classList.remove('module-bandeja');
    if (menuBackdata) menuBackdata.classList.add('active');
    if (menuBandeja) menuBandeja.classList.remove('active');
    // Ocultar vistas de bandeja
    if (kanbanBoard) kanbanBoard.classList.add('hidden');
    if (splitListPanel) splitListPanel.classList.add('hidden');
    // Ocultar controles exclusivos y métricas de bandeja
    const viewModeToggle = document.getElementById('view-mode-toggle');
    const filterPills = document.getElementById('filter-pills');
    const headerTag = document.getElementById('header-tag');
    const headerTitle = document.getElementById('header-title');
    const headerDesc = document.getElementById('header-desc');
    if (viewModeToggle) viewModeToggle.classList.add('hidden');
    if (filterPills) filterPills.classList.add('hidden');
    if (kpiMetricsRow) kpiMetricsRow.classList.add('hidden');
    if (headerTag) headerTag.textContent = 'BACK DATA';
    if (headerTitle) headerTitle.textContent = 'Back Data';
    if (headerDesc) headerDesc.textContent = 'Grupos de envío y clientes de back data.';
    // Mostrar panel backdata
    if (backdataPanel) backdataPanel.classList.remove('hidden');
    if (btnResolveChat) btnResolveChat.classList.add('hidden');

    // El chat de Bandeja NUNCA se muestra en Back Data
    if (state.activeChatBackdata) {
        selectChat(state.activeChatBackdata);
    } else {
        state.activeChat = null;
        if (activeChatPanel) activeChatPanel.classList.add('hidden');
    }
    renderBackdataList();
}

if (menuBandeja) menuBandeja.addEventListener('click', (e) => { e.preventDefault(); activarModuloBandeja(); });
if (menuBackdata) menuBackdata.addEventListener('click', (e) => { e.preventDefault(); activarModuloBackdata(); });

function categorizeItem(item) {
    const stage = String(item.stage || item.leadStatus || '').toLowerCase();
    if (stage === 'attended' || stage === 'atendido') return 'attended';
    if (stage === 'blacklist' || stage === 'black_list' || stage === 'discarded' || stage === 'descartado') return 'blacklist';
    return 'unanswered';
}

function getChatKey(item) {
    return `${item.accountId}:${item.leadPhone || item.name}`;
}

function getAvatarColorClass(name) {
    const colors = ['avatar-red', 'avatar-teal', 'avatar-purple', 'avatar-slate', 'avatar-green', 'avatar-blue'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
        hash = (hash + name.charCodeAt(i)) % colors.length;
    }
    return colors[hash];
}

function formatTimeDisplay(timestamp) {
    if (!timestamp) return 'Reciente';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Reciente';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return `${date.getDate()}/${date.getMonth() + 1}`;
}

// ==================== RENDERIZADO KANBAN Y METRICAS ====================
function renderAll() {
    if (kpiMetricsRow) {
        kpiMetricsRow.classList.toggle('hidden', state.activeModule === 'backdata');
    }
    // Excluir chats de Back Data de la Bandeja de conversaciones
    const bandejaQueue = (state.queue || []).filter(it => !isBackdataItem(it) && !(ocultarSalas && it.esSala));
    let items = [...bandejaQueue];
    const noFilters = state.accountFilter === 'all' && !state.searchQuery && state.filter !== 'unanswered' && state.filter !== 'mine';

    if (state.accountFilter !== 'all') {
        items = items.filter(it => it.accountId === state.accountFilter);
    }

    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase().trim();
        // El @usuario de WhatsApp tambien se busca, con o sin "@"
        const qUsuario = q.replace(/^@+/, '');
        items = items.filter(it => {
            const name = (it.name || '').toLowerCase();
            const phone = (it.leadPhone || it.chatPhone || '').toLowerCase();
            const preview = (it.preview || '').toLowerCase();
            const usuario = String(it.username || '').toLowerCase().replace(/^@+/, '');
            return name.includes(q) || phone.includes(q) || preview.includes(q)
                || Boolean(qUsuario && usuario && usuario.includes(qUsuario));
        });
    }

    if (state.filter === 'unanswered') {
        items = items.filter(it => categorizeItem(it) === 'unanswered');
    } else if (state.filter === 'mine') {
        items = items.filter(it => {
            const key = getChatKey(it);
            return state.claims[key] && state.claims[key].agentName === state.agentName;
        });
    }

    const colUnanswered = [];
    const colBlacklist = [];
    const colAttended = [];

    items.forEach(item => {
        const category = categorizeItem(item);
        if (category === 'blacklist') colBlacklist.push(item);
        else if (category === 'attended') colAttended.push(item);
        else colUnanswered.push(item);
    });

    // Los KPI de arriba son sobre TODA la bandeja (sin filtro/busqueda), asi que
    // no se puede reusar colUnanswered/etc directamente si hay un filtro activo.
    // Se recorre bandejaQueue una sola vez en vez de 3 .filter() separados
    // (con 15000+ chats, cada pasada extra se nota, sobre todo en cada scroll).
    let totalCount = 0, unansweredCount = 0, blacklistCount = 0, attendedCount = 0;
    if (noFilters) {
        totalCount = bandejaQueue.length;
        unansweredCount = colUnanswered.length;
        blacklistCount = colBlacklist.length;
        attendedCount = colAttended.length;
    } else {
        totalCount = bandejaQueue.length;
        for (const it of bandejaQueue) {
            const c = categorizeItem(it);
            if (c === 'blacklist') blacklistCount++;
            else if (c === 'attended') attendedCount++;
            else unansweredCount++;
        }
    }

    kpiTotal.textContent = totalCount.toLocaleString();
    kpiUnanswered.textContent = unansweredCount.toLocaleString();
    if (kpiBlacklist) kpiBlacklist.textContent = blacklistCount.toLocaleString();
    kpiAttended.textContent = attendedCount.toLocaleString();

    if (countUnansweredBadge) countUnansweredBadge.textContent = unansweredCount > 0 ? (unansweredCount > 99 ? '99+' : unansweredCount) : '0';
    if (countAll) countAll.textContent = totalCount;
    if (countUnanswered) countUnanswered.textContent = unansweredCount;
    if (countMine) countMine.textContent = Object.values(state.claims).filter(c => c.agentName === state.agentName).length;

    badgeColUnanswered.textContent = colUnanswered.length;
    badgeColBlacklist.textContent = colBlacklist.length;
    badgeColAttended.textContent = colAttended.length;

    renderColumnCards(cardsColUnanswered, colUnanswered, 'col-unanswered', footerColUnanswered);
    renderColumnCards(cardsColBlacklist, colBlacklist, 'col-blacklist', footerColBlacklist);
    renderColumnCards(cardsColAttended, colAttended, 'col-attended', footerColAttended);

    if (state.viewMode === 'split') {
        renderSplitList(items);
    }

    if (state.activeModule === 'backdata') {
        renderBackdataList();
    }
}

function getAccountDisplayName(accountId) {
    if (!accountId) return 'WhatsApp';
    const acc = state.accounts.find(a => a.id === accountId);
    if (acc && acc.title) return acc.title;
    return accountId;
}

const KANBAN_PAGE_SIZE = 40; // tamaño de cada tanda que se agrega al hacer scroll

// Une el scroll infinito a un contenedor de lista (una sola vez por elemento):
// al acercarse al final, muestra otra tanda de KANBAN_PAGE_SIZE chats.
function bindInfiniteScroll(container, colId) {
    if (!container || container.dataset.infiniteScrollBound) return;
    container.dataset.infiniteScrollBound = '1';
    let pending = false; // evita apilar renderAll() mientras el usuario sigue deslizando
    container.addEventListener('scroll', () => {
        if (pending) return;
        const nearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 150;
        if (!nearBottom) return;
        pending = true;
        requestAnimationFrame(() => {
            const current = state.colVisible[colId] || KANBAN_PAGE_SIZE;
            state.colVisible[colId] = current + KANBAN_PAGE_SIZE;
            renderAll();
            pending = false;
        });
    });
}

function renderColumnCards(container, list, colId, footerEl) {
    if (!container) return;

    const totalItems = list.length;
    if (!state.colVisible[colId] || state.colVisible[colId] < KANBAN_PAGE_SIZE) {
        state.colVisible[colId] = KANBAN_PAGE_SIZE;
    }
    const visibleCount = Math.min(state.colVisible[colId], totalItems);
    const pageItems = list.slice(0, visibleCount);
    bindInfiniteScroll(container, colId);

    if (list.length === 0) {
        container.innerHTML = '<div class="empty-col-placeholder" style="padding: 24px 10px; text-align: center; color: #94a3b8; font-size: 12px;">Sin contactos pendientes</div>';
        if (footerEl) footerEl.classList.add('hidden');
        return;
    }

    const emptyPlaceholder = container.querySelector('.empty-col-placeholder');
    if (emptyPlaceholder) emptyPlaceholder.remove();

    // Index existing card elements by data-key
    const existingCards = new Map();
    container.querySelectorAll('.crm-card').forEach(el => {
        if (el.dataset.key) existingCards.set(el.dataset.key, el);
    });

    const targetKeys = new Set(pageItems.map(it => getChatKey(it)));

    // Remove cards that are not in this page slice
    existingCards.forEach((el, key) => {
        if (!targetKeys.has(key)) {
            el.remove();
        }
    });

    // Update or insert cards in order
    pageItems.forEach((item, index) => {
        const key = getChatKey(item);
        let card = existingCards.get(key);
        const isActive = state.activeChat && getChatKey(state.activeChat) === key;
        if (isActive) {
            item.count = 0;
        }
        const claim = state.claims[key];
        const accountDisplayName = getAccountDisplayName(item.accountId);

        if (!card) {
            card = createContactCard(item);
            const refChild = container.children[index];
            if (refChild) {
                container.insertBefore(card, refChild);
            } else {
                container.appendChild(card);
            }
        } else {
            card.classList.toggle('active', isActive);

            let displayName = (item.name || '').trim();
            if (!displayName || /^\d{13,20}$/.test(displayName)) {
                displayName = 'Usuario WhatsApp';
            }
            const nameEl = card.querySelector('.card-name-phone');
            if (nameEl && nameEl.textContent !== displayName) {
                nameEl.textContent = displayName;
            }

            const initials = displayName === 'Usuario WhatsApp' ? 'UW' : (displayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'UW');
            const avatarDiv = card.querySelector('.card-avatar');
            if (avatarDiv && avatarDiv.textContent !== initials) {
                avatarDiv.textContent = initials;
            }

            // Raw phone / phoneDisplay update
            const rawPhone = item.leadPhone || item.phone || item.chatPhone || item.leadPhoneDisplay;
            const valid = isValidPeruvianMobile(rawPhone);
            let phoneDisplay = valid ? formatPhoneNumber(valid) : '';
            if (!phoneDisplay && item.name && !/^\d{13,20}$/.test(item.name.trim())) {
                const match = item.name.match(/(?:\+?51\s*|(?<=\D|^))(9\d{2}[\s.-]?\d{3}[\s.-]?\d{3})(?=\D|$)/);
                if (match) phoneDisplay = formatPhoneNumber(match[1]);
            }
            if (!phoneDisplay) {
                const usuario = getUsernameDisplay(item);
                if (usuario && usuario !== displayName) phoneDisplay = usuario;
            }
            const phoneEl = card.querySelector('.card-phone-number');
            if (phoneDisplay) {
                if (phoneEl) {
                    if (phoneEl.textContent !== phoneDisplay) phoneEl.textContent = phoneDisplay;
                } else {
                    const infoDiv = card.querySelector('.card-info');
                    if (infoDiv) {
                        const newPhoneDiv = document.createElement('div');
                        newPhoneDiv.className = 'card-phone-number';
                        newPhoneDiv.textContent = phoneDisplay;
                        infoDiv.appendChild(newPhoneDiv);
                    }
                }
            } else if (phoneEl) {
                phoneEl.remove();
            }

            const previewEl = card.querySelector('.card-preview-text');
            const newPreview = item.preview || '(Sin mensaje reciente)';
            if (previewEl && previewEl.textContent !== newPreview) {
                previewEl.textContent = newPreview;
            }

            const timeEl = card.querySelector('.card-time');
            const newTime = formatTimeDisplay(item.time);
            if (timeEl && timeEl.textContent !== newTime) {
                timeEl.textContent = newTime;
            }

            // Unread circle
            let unreadCircle = card.querySelector('.card-unread-circle');
            if (item.count > 0) {
                if (!unreadCircle) {
                    unreadCircle = document.createElement('div');
                    unreadCircle.className = 'card-unread-circle';
                    const tagsRight = card.querySelector('.card-tags-right');
                    if (tagsRight) tagsRight.appendChild(unreadCircle);
                }
                if (unreadCircle && unreadCircle.textContent !== String(item.count)) {
                    unreadCircle.textContent = item.count;
                }
            } else if (unreadCircle) {
                unreadCircle.remove();
            }

            const cardStageSelect = card.querySelector('.card-stage-select');
            if (cardStageSelect) {
                const curCat = categorizeItem(item);
                if (cardStageSelect.value !== curCat) cardStageSelect.value = curCat;
            }

            // Account badge
            const accBadge = card.querySelector('.card-account-badge');
            if (accBadge && accBadge.textContent !== accountDisplayName) {
                accBadge.textContent = accountDisplayName;
                accBadge.title = `Identificador: ${item.accountId}`;
            }

            // Claimed pill
            const tagsLeft = card.querySelector('.card-tags-left');
            if (tagsLeft) {
                let claimPill = tagsLeft.querySelector('.card-claimed-pill');
                if (claim) {
                    const claimText = `Asesor: ${claim.agentName}`;
                    if (!claimPill) {
                        claimPill = document.createElement('span');
                        claimPill.className = 'card-claimed-pill';
                        tagsLeft.appendChild(claimPill);
                    }
                    if (claimPill.textContent !== claimText) {
                        claimPill.textContent = claimText;
                    }
                } else if (claimPill) {
                    claimPill.remove();
                }
            }

            // Ensure proper visual order in column
            const currentChildAtIndex = container.children[index];
            if (currentChildAtIndex !== card) {
                container.insertBefore(card, currentChildAtIndex || null);
            }
        }
    });

    // Scroll infinito silencioso: sin botones ni texto "Mostrando X de Y".
    if (footerEl) {
        footerEl.classList.add('hidden');
    }
}

// navigator.clipboard solo existe en contextos seguros (HTTPS/localhost); este
// panel corre en HTTP plano, asi que ahi es undefined y "Copiar" no hacia nada
// sin avisar. Se usa cuando esta disponible y si no, el truco clasico del
// textarea oculto + execCommand('copy'), que si funciona por HTTP.
async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {}
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

function isValidPeruvianMobile(phoneDigits) {
    if (!phoneDigits) return '';
    const clean = String(phoneDigits).replace(/\D/g, '');
    if (clean.length === 9 && clean.startsWith('9')) return clean;
    if (clean.length === 11 && clean.startsWith('519')) return clean.slice(2);
    return '';
}

// Contactos de WhatsApp que no muestran numero sino un @usuario: se muestra ese usuario
function getUsernameDisplay(item) {
    const guardado = String((item && item.username) || '').trim();
    if (guardado) return guardado.startsWith('@') ? guardado : '@' + guardado;
    const nombre = String((item && item.name) || '').trim();
    return nombre.startsWith('@') ? nombre : '';
}

function formatPhoneNumber(phoneDigits) {
    const valid = isValidPeruvianMobile(phoneDigits);
    if (!valid) return '';
    return `+51 ${valid.slice(0, 3)} ${valid.slice(3, 6)} ${valid.slice(6)}`;
}

function createContactCard(item) {
    const card = document.createElement('div');
    const chatKey = getChatKey(item);
    const isActive = state.activeChat && getChatKey(state.activeChat) === chatKey;
    const claim = state.claims[chatKey];

    card.className = `crm-card ${isActive ? 'active' : ''}`;
    card.dataset.key = chatKey;

    let displayName = (item.name || '').trim();
    if (!displayName || /^\d{13,20}$/.test(displayName)) {
        displayName = 'Usuario WhatsApp';
    }
    const initials = displayName === 'Usuario WhatsApp' ? 'UW' : (displayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'UW');
    const avatarColor = getAvatarColorClass(displayName);
    const timeStr = formatTimeDisplay(item.time);
    const accountDisplayName = getAccountDisplayName(item.accountId);

    // Obtener número de celular legítimo (nunca de preview donde hay tickets)
    const rawPhone = item.leadPhone || item.phone || item.chatPhone || item.leadPhoneDisplay;
    const valid = isValidPeruvianMobile(rawPhone);
    let phoneDisplay = valid ? formatPhoneNumber(valid) : '';
    if (!phoneDisplay && item.name && !/^\d{13,20}$/.test(item.name.trim())) {
        const match = item.name.match(/(?:\+?51\s*|(?<=\D|^))(9\d{2}[\s.-]?\d{3}[\s.-]?\d{3})(?=\D|$)/);
        if (match) phoneDisplay = formatPhoneNumber(match[1]);
    }

    if (!phoneDisplay) {
        const usuario = getUsernameDisplay(item);
        if (usuario && usuario !== displayName) phoneDisplay = usuario;
    }

    const avatarHtml = item.avatarUrl
        ? `<img src="${escapeHtml(item.avatarUrl)}" class="card-avatar-img" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="card-avatar ${avatarColor}" style="display:none;">${initials}</div>`
        : `<div class="card-avatar ${avatarColor}">${initials}</div>`;

    const cat = categorizeItem(item);
    const statusPill = cat === 'attended'
        ? '<span class="card-status-pill status-attended">ATENDIDO</span>'
        : cat === 'blacklist'
            ? '<span class="card-status-pill status-blacklist">BLACK LIST</span>'
            : '<span class="card-status-pill status-unanswered">NUEVO</span>';

    card.innerHTML = `
        <div class="crm-card-top">
            ${avatarHtml}
            <div class="card-info">
                <div class="card-phone-row">
                    <span class="card-country-flag">PE</span>
                    <strong class="card-name-phone">${escapeHtml(displayName)}</strong>
                    <span class="card-time">${timeStr}</span>
                </div>
                ${phoneDisplay ? `<div class="card-phone-number">${escapeHtml(phoneDisplay)}</div>` : ''}
            </div>
        </div>
        <div class="card-preview-text">${escapeHtml(item.preview || '(Sin mensaje reciente)')}</div>
        <div class="card-tags-row">
            <div class="card-tags-left">
                ${statusPill}
                <span class="card-account-badge" title="Identificador: ${escapeHtml(item.accountId)}">${escapeHtml(accountDisplayName)}</span>
                ${claim
                    ? `<span class="card-claimed-pill">Asesor: ${escapeHtml(claim.agentName)}</span>`
                    : (item.attendedBy ? `<span class="card-claimed-pill">Atendido: ${escapeHtml(item.attendedBy)}</span>` : '')}
            </div>
            <div class="card-tags-right" style="display: flex; align-items: center; gap: 6px;">
                ${item.count > 0 ? `<div class="card-unread-circle">${item.count}</div>` : ''}
            </div>
        </div>
    `;

    // Hacer la tarjeta arrastrable a cualquier columna
    card.setAttribute('draggable', 'true');
    card.dataset.chatKey = chatKey;
    card.dataset.accountId = item.accountId;
    card.dataset.phone = item.leadPhone || item.phone || item.chatPhone || '';
    card.dataset.name = item.name || '';

    card.addEventListener('dragstart', (e) => {
        if (e.target.closest('select, button, a')) {
            e.preventDefault();
            return;
        }
        card._dragged = true;
        card.classList.add('is-dragging');
        document.body.classList.add('kanban-dragging-active');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({
            accountId: item.accountId,
            phone: item.leadPhone || item.phone || item.chatPhone || '',
            name: item.name || '',
            key: chatKey
        }));
    });

    card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        document.body.classList.remove('kanban-dragging-active');
        document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
        setTimeout(() => { card._dragged = false; }, 80);
    });

    const stageSelect = card.querySelector('.card-stage-select');
    if (stageSelect) {
        stageSelect.addEventListener('change', (e) => {
            e.stopPropagation();
            const newStage = stageSelect.value;
            moveChatToStage({
                accountId: item.accountId,
                phone: item.leadPhone || item.phone,
                name: item.name,
                key: chatKey
            }, newStage);
        });
    }

    card.addEventListener('click', (e) => {
        if (card._dragged) return;
        if (e.target.closest('select, button, a')) return;
        selectChat(item);
    });

    return card;
}

function moveChatToStage(data, targetStage) {
    const { accountId, phone, name, key } = data || {};
    if (!accountId) return;

    const item = (state.queue || []).find(it => {
        if (it.accountId !== accountId) return false;
        if (key && getChatKey(it) === key) return true;
        if (phone && (it.leadPhone === phone || it.chatPhone === phone)) return true;
        if (name && it.name === name) return true;
        return false;
    });

    if (item) {
        item.stage = targetStage;
        item.leadStatus = targetStage;
    }

    if (state.activeChat && state.activeChat.accountId === accountId &&
        (key ? getChatKey(state.activeChat) === key : (state.activeChat.name === name || (phone && (state.activeChat.leadPhone === phone || state.activeChat.phone === phone))))) {
        state.activeChat.stage = targetStage;
        state.activeChat.leadStatus = targetStage;
        const activeChatStageSelect = document.getElementById('active-chat-stage-select');
        if (activeChatStageSelect) activeChatStageSelect.value = targetStage;
    }

    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({
            type: 'UPDATE_CHAT_STAGE',
            chatKey: item ? item.chatKey : undefined,
            accountId,
            phone: phone || (item ? (item.leadPhone || item.phone || item.chatPhone) : ''),
            name: name || (item ? item.name : ''),
            stage: targetStage
        }));
    } else {
        fetch('/api/chats/stage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                chatKey: item ? item.chatKey : undefined,
                accountId,
                phone: phone || (item ? (item.leadPhone || item.phone || item.chatPhone) : ''),
                name: name || (item ? item.name : ''),
                stage: targetStage
            })
        }).catch(() => {});
    }

    renderAll();
}

function setupKanbanDragAndDrop() {
    const columnConfigs = [
        { stage: 'unanswered', selector: '.kanban-col.col-unanswered' },
        { stage: 'blacklist', selector: '.kanban-col.col-blacklist' },
        { stage: 'attended', selector: '.kanban-col.col-attended' }
    ];

    columnConfigs.forEach(({ stage, selector }) => {
        const col = document.querySelector(selector);
        if (!col) return;

        col.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (!col.classList.contains('drag-over')) {
                col.classList.add('drag-over');
            }
        });

        col.addEventListener('dragenter', (e) => {
            e.preventDefault();
            col.classList.add('drag-over');
        });

        col.addEventListener('dragleave', (e) => {
            if (!col.contains(e.relatedTarget)) {
                col.classList.remove('drag-over');
            }
        });

        col.addEventListener('drop', (e) => {
            e.preventDefault();
            col.classList.remove('drag-over');
            document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
            document.body.classList.remove('kanban-dragging-active');

            try {
                const textData = e.dataTransfer.getData('text/plain');
                if (!textData) return;
                const data = JSON.parse(textData);
                if (data && data.accountId) {
                    moveChatToStage(data, stage);
                }
            } catch (err) {
                console.warn('[DRAG DROP ERROR]', err);
            }
        });
    });
}

function renderSplitList(items) {
    if (!chatList) return;
    renderColumnCards(chatList, items || state.queue, 'split-list', footerSplitList);
}

function renderBackdataList() {
    if (!backdataList) return;
    let items = (state.queue || []).filter(item => isBackdataItem(item));
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase().trim();
        // El @usuario de WhatsApp tambien se busca, con o sin "@"
        const qUsuario = q.replace(/^@+/, '');
        items = items.filter(it => {
            const name = (it.name || '').toLowerCase();
            const phone = (it.leadPhone || it.chatPhone || '').toLowerCase();
            const preview = (it.preview || '').toLowerCase();
            const usuario = String(it.username || '').toLowerCase().replace(/^@+/, '');
            return name.includes(q) || phone.includes(q) || preview.includes(q)
                || Boolean(qUsuario && usuario && usuario.includes(qUsuario));
        });
    }
    renderColumnCards(backdataList, items, 'backdata-list', footerBackdataList);
}

// ==================== APERTURA DE CHAT ====================
function selectChat(item) {
    const isBack = isBackdataItem(item) || (state.activeModule === 'backdata');
    if (isBack) {
        state.activeChatBackdata = item;
    } else {
        state.activeChatBandeja = item;
    }
    state.activeChat = item;
    item.count = 0;
    const chatKey = getChatKey(item);

    const qItem = (state.queue || []).find(it => getChatKey(it) === chatKey);
    if (qItem) qItem.count = 0;

    // Quitar badge visual de inmediato
    const activeCards = document.querySelectorAll(`.crm-card[data-key="${chatKey}"]`);
    activeCards.forEach(c => {
        const circle = c.querySelector('.card-unread-circle');
        if (circle) circle.remove();
    });

    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({
            type: 'CLAIM_CHAT',
            accountId: item.accountId,
            phone: item.leadPhone,
            name: item.name
        }));
        state.socket.send(JSON.stringify({
            type: 'MARK_CHAT_READ',
            chatKey: item.chatKey,
            accountId: item.accountId,
            phone: item.leadPhone,
            name: item.name
        }));
    }

    if (activeChatPanel) activeChatPanel.classList.remove('hidden');

    let displayName = (item.name || '').trim();
    if (!displayName || /^\d{13,20}$/.test(displayName)) {
        displayName = 'Usuario WhatsApp';
    }
    const initials = displayName === 'Usuario WhatsApp' ? 'UW' : (displayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'UW');
    if (activeAvatar) {
        if (item.avatarUrl) {
            activeAvatar.innerHTML = `<img src="${escapeHtml(item.avatarUrl)}" class="header-avatar-img" alt="" onerror="this.parentElement.textContent='${initials}'" />`;
        } else {
            activeAvatar.textContent = initials;
        }
    }
    if (activeContactName) activeContactName.textContent = displayName;

    // Actualizar identificador de la línea en la cabecera del chat
    if (activeAccountBadge) {
        const accName = getAccountDisplayName(item.accountId);
        activeAccountBadge.textContent = `Línea: ${accName}`;
        activeAccountBadge.title = `Identificador: ${item.accountId}`;
    }

    const rawPhone = item.leadPhone || item.phone || item.chatPhone || item.leadPhoneDisplay;
    const valid = isValidPeruvianMobile(rawPhone);
    let phoneDisplay = valid ? formatPhoneNumber(valid) : '';
    if (!phoneDisplay && item.name && !/^\d{13,20}$/.test(item.name.trim())) {
        const match = item.name.match(/(?:\+?51\s*|(?<=\D|^))(9\d{2}[\s.-]?\d{3}[\s.-]?\d{3})(?=\D|$)/);
        if (match) phoneDisplay = formatPhoneNumber(match[1]);
    }
    if (activePhoneDisplay) activePhoneDisplay.textContent = phoneDisplay || getUsernameDisplay(item) || 'Sin celular registrado';
    if (activeWaitTime) activeWaitTime.textContent = item.waitMin ? `${item.waitMin} min de espera` : 'Reciente';

    const activeChatStageSelect = document.getElementById('active-chat-stage-select');
    if (activeChatStageSelect) {
        activeChatStageSelect.value = categorizeItem(item);
    }

    updateCollisionBanner();

    // Cargar mensajes desde cache si existen para cambio instantaneo de chat
    const cached = (state.chatMessagesCache && state.chatMessagesCache.get(chatKey));
    if (cached && cached.length > 0) {
        state.activeChatMessages = [...cached];
        renderMessageHistory(cached);
    } else {
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">Cargando historial de WhatsApp...</div>';
        }
        state.renderedMessageKeys.clear();
        state.activeChatMessages = [];
    }
    if (messagesLoadMoreWrap) {
        messagesLoadMoreWrap.classList.add('hidden');
    }
    state.activeChatDisplayedCount = CHAT_PAGE_SIZE;

    // Solicitar historial real a Electron/WhatsApp Web
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({
            type: 'GET_CHAT_HISTORY',
            accountId: item.accountId,
            phone: valid || item.leadPhone,
            name: item.name
        }));
    }

    renderAll();
    if (composerInput) {
        composerInput.focus();
        // Chat nuevo (sin responder): el cuadro ya trae el mensaje de bienvenida marcado como
        // autoNuevos en las respuestas rapidas; el asesor solo lo revisa y pulsa Enviar (sin copiar/pegar).
        const plantilla = (state.quickReplies || []).find(qr => qr.autoNuevos);
        if (plantilla) {
            const esNuevo = categorizeItem(item) === 'unanswered';
            if (esNuevo && !composerInput.value.trim()) {
                composerInput.value = plantilla.text;
                composerInput.dispatchEvent(new Event('input'));
            } else if (!esNuevo && composerInput.value === plantilla.text) {
                // la bienvenida quedo sin enviar: no se arrastra a un chat que ya esta atendido
                composerInput.value = '';
                composerInput.dispatchEvent(new Event('input'));
            }
        }
    }

    // Ocultar respuestas rápidas y botón Marcar Atendido en Back Data pero SIEMPRE mantener el compositor para poder responder
    const isBackdata = isBackdataItem(item) || (state.activeModule === 'backdata');
    if (quickRepliesBar) quickRepliesBar.classList.toggle('hidden', isBackdata);
    if (btnResolveChat) btnResolveChat.classList.toggle('hidden', isBackdata);
    if (composerForm) {
        composerForm.closest('.chat-composer')?.classList.remove('hidden');
    }
}

function updateCollisionBanner() {
    if (!state.activeChat) return;
    const chatKey = getChatKey(state.activeChat);
    const claim = state.claims[chatKey];

    if (claim && claim.agentName !== state.agentName) {
        claimedByName.textContent = claim.agentName;
        collisionAlert.classList.remove('hidden');
    } else {
        collisionAlert.classList.add('hidden');
    }
}

btnCloseChat.addEventListener('click', () => {
    if (state.activeChat && state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({
            type: 'RELEASE_CHAT',
            accountId: state.activeChat.accountId,
            phone: state.activeChat.leadPhone,
            name: state.activeChat.name
        }));
    }
    if (state.activeModule === 'backdata' || isBackdataItem(state.activeChat)) {
        state.activeChatBackdata = null;
    } else {
        state.activeChatBandeja = null;
    }
    state.activeChat = null;
    activeChatPanel.classList.add('hidden');
    renderAll();
});

// Escape cierra el chat abierto (si no hay un modal encima, que tiene prioridad)
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (activeChatPanel.classList.contains('hidden')) return;
    const openModal = document.querySelector('.modal-overlay:not(.hidden)');
    if (openModal) return;
    btnCloseChat.click();
});

btnCopyPhone.addEventListener('click', async () => {
    if (!state.activeChat) return;
    const raw = state.activeChat.leadPhone || state.activeChat.phone;
    const valid = isValidPeruvianMobile(raw);
    if (!valid) {
        const usuario = getUsernameDisplay(state.activeChat);
        if (usuario) {
            const okUsuario = await copyToClipboard(usuario);
            btnCopyPhone.classList.toggle('copied', okUsuario);
            btnCopyPhone.title = okUsuario ? 'Usuario copiado' : 'No se pudo copiar';
            setTimeout(() => { btnCopyPhone.classList.remove('copied'); btnCopyPhone.title = 'Copiar número'; }, 1400);
            return;
        }
        btnCopyPhone.title = 'Sin número';
        setTimeout(() => { btnCopyPhone.title = 'Copiar número'; }, 1400);
        return;
    }
    const ok = await copyToClipboard(valid);
    btnCopyPhone.classList.toggle('copied', ok);
    btnCopyPhone.title = ok ? 'Copiado' : 'No se pudo copiar';
    setTimeout(() => {
        btnCopyPhone.classList.remove('copied');
        btnCopyPhone.title = 'Copiar número';
    }, 1400);
});

const btnEditContactName = document.getElementById('btn-edit-contact-name');
if (btnEditContactName) {
    btnEditContactName.addEventListener('click', () => {
        if (!state.activeChat) return;
        const currentName = (state.activeChat.name && state.activeChat.name !== 'Usuario WhatsApp') ? state.activeChat.name : '';
        const newName = prompt('Editar nombre o @usuario de WhatsApp para este cliente:', currentName);
        if (newName === null) return;
        const clean = newName.trim();
        if (!clean) return;

        const oldName = state.activeChat.name;
        state.activeChat.name = clean;
        if (activeContactName) activeContactName.textContent = clean;
        const initials = clean.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'UW';
        if (activeAvatar && !state.activeChat.avatarUrl) {
            activeAvatar.textContent = initials;
        }

        const qItem = (state.queue || []).find(it => getChatKey(it) === getChatKey(state.activeChat));
        if (qItem) qItem.name = clean;

        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
            state.socket.send(JSON.stringify({
                type: 'UPDATE_CONTACT_NAME',
                accountId: state.activeChat.accountId,
                phone: state.activeChat.leadPhone || state.activeChat.phone,
                name: oldName,
                newName: clean
            }));
        }
        renderAll();
    });
}

const activeChatStageSelect = document.getElementById('active-chat-stage-select');
if (activeChatStageSelect) {
    activeChatStageSelect.addEventListener('change', () => {
        if (!state.activeChat) return;
        const newStage = activeChatStageSelect.value;
        state.activeChat.leadStatus = newStage;
        state.activeChat.stage = newStage;

        const claveActiva = state.activeChat.chatKey;
        const queueItem = (claveActiva && state.queue.find(q => q.chatKey === claveActiva)) ||
            state.queue.find(q => q.accountId === state.activeChat.accountId && ((q.leadPhone && q.leadPhone === state.activeChat.leadPhone) || q.name === state.activeChat.name));
        if (queueItem) {
            queueItem.leadStatus = newStage;
            queueItem.stage = newStage;
        }

        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
            state.socket.send(JSON.stringify({
                type: 'UPDATE_CHAT_STAGE',
                chatKey: state.activeChat.chatKey,
                accountId: state.activeChat.accountId,
                phone: state.activeChat.leadPhone || state.activeChat.phone,
                name: state.activeChat.name,
                stage: newStage
            }));
        }
        renderAll();
    });
}

btnResolveChat.addEventListener('click', () => {
    if (!state.activeChat) return;
    state.activeChat.leadStatus = 'attended';
    state.activeChat.stage = 'attended';
    const claveActiva = state.activeChat.chatKey;
    const queueItem = (claveActiva && state.queue.find(q => q.chatKey === claveActiva)) ||
        state.queue.find(q => q.accountId === state.activeChat.accountId && ((q.leadPhone && q.leadPhone === state.activeChat.leadPhone) || q.name === state.activeChat.name));
    if (queueItem) {
        queueItem.leadStatus = 'attended';
        queueItem.stage = 'attended';
    }
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({
            type: 'MARK_ATTENDED',
            chatKey: state.activeChat.chatKey,
            accountId: state.activeChat.accountId,
            phone: state.activeChat.leadPhone || state.activeChat.phone,
            name: state.activeChat.name
        }));
    }
    state.activeChatBandeja = null;
    state.activeChat = null;
    activeChatPanel.classList.add('hidden');
    renderAll();
});

// ==================== MENSAJES Y DEDUPLICACIÓN ====================
const CHAT_PAGE_SIZE = 35;

function formatWhatsAppText(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);
    escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre class="wa-code-block"><code>$1</code></pre>');
    escaped = escaped.replace(/`([^`\n]+)`/g, '<code class="wa-inline-code">$1</code>');
    escaped = escaped.replace(/(^|[^\w*])\*([^*\n]+)\*([^\w*]|$)/g, '$1<strong>$2</strong>$3');
    escaped = escaped.replace(/(^|[^\w_])_([^_\n]+)_([^\w_]|$)/g, '$1<em>$2</em>$3');
    escaped = escaped.replace(/(^|[^\w~])~([^~\n]+)~([^\w~]|$)/g, '$1<del>$2</del>$3');
    escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="wa-link">$1</a>');
    escaped = escaped.replace(/\n/g, '<br>');
    return escaped;
}
function formatDateSeparator(timestamp) {
    if (!timestamp) return 'HOY';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'HOY';

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (d1, d2) => 
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();

    if (isSameDay(date, today)) return 'HOY';
    if (isSameDay(date, yesterday)) return 'AYER';

    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`.toUpperCase();
}

function renderMessageHistory(messages) {
    messagesContainer.innerHTML = '';
    state.renderedMessageKeys.clear();

    const validMessages = Array.isArray(messages) ? messages : [];
    
    // Deduplicar mensajes del asesor entre temporales msg_ y confirmados de WhatsApp
    const deduped = [];
    validMessages.forEach(msg => {
        if (msg.fromAgent) {
            const dupIdx = deduped.findIndex(other => other.fromAgent && other.text === msg.text && Math.abs((Number(other.time) || 0) - (Number(msg.time) || 0)) < 30000);
            if (dupIdx !== -1) {
                if (msg.id && !msg.id.startsWith('msg_')) {
                    deduped[dupIdx] = msg;
                }
                return;
            }
        }
        deduped.push(msg);
    });

    state.activeChatMessages = deduped;
    state.activeChatDisplayedCount = Math.min(deduped.length, CHAT_PAGE_SIZE);

    if (deduped.length > 0) {
        updateMessageHistoryView(true);
    } else {
        if (messagesLoadMoreWrap) messagesLoadMoreWrap.classList.add('hidden');
        messagesContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">Sin mensajes previos registrados en este chat.</div>';
    }
}

function updateMessageHistoryView(scrollToBottom = false) {
    const allMsgs = state.activeChatMessages || [];
    const countToShow = state.activeChatDisplayedCount || CHAT_PAGE_SIZE;
    const remaining = Math.max(0, allMsgs.length - countToShow);

    // Botón de cargar más mensajes
    if (messagesLoadMoreWrap) {
        messagesLoadMoreWrap.classList.remove('hidden');
        if (btnLoadMoreMsgs) {
            btnLoadMoreMsgs.innerHTML = remaining > 0 
                ? `▲ Cargar mensajes anteriores (${remaining} más)`
                : `▲ Cargar más historial de WhatsApp`;
        }
    }

    // Porción de mensajes más recientes a mostrar
    const slice = allMsgs.slice(Math.max(0, allMsgs.length - countToShow));
    messagesContainer.innerHTML = '';
    state.renderedMessageKeys.clear();

    let lastDateStr = '';
    slice.forEach(msg => {
        const msgTime = msg.time ? new Date(msg.time) : null;
        if (msgTime && !isNaN(msgTime.getTime())) {
            const dateStr = `${msgTime.getFullYear()}-${msgTime.getMonth()}-${msgTime.getDate()}`;
            if (dateStr !== lastDateStr) {
                lastDateStr = dateStr;
                const sep = document.createElement('div');
                sep.className = 'chat-date-separator';
                sep.innerHTML = `<span class="chat-date-pill">${formatDateSeparator(msg.time)}</span>`;
                messagesContainer.appendChild(sep);
            }
        }
        appendMessageBubble(msg, false);
    });

    if (scrollToBottom && chatMessagesEl) {
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
        requestAnimationFrame(() => {
            if (chatMessagesEl) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
        });
    }
}

if (btnLoadMoreMsgs) {
    btnLoadMoreMsgs.addEventListener('click', () => {
        const allMsgs = state.activeChatMessages || [];
        const currentCount = state.activeChatDisplayedCount || CHAT_PAGE_SIZE;

        if (currentCount < allMsgs.length) {
            const prevScrollHeight = chatMessagesEl ? chatMessagesEl.scrollHeight : 0;
            const prevScrollTop = chatMessagesEl ? chatMessagesEl.scrollTop : 0;

            state.activeChatDisplayedCount = Math.min(allMsgs.length, currentCount + CHAT_PAGE_SIZE);
            updateMessageHistoryView(false);

            if (chatMessagesEl) {
                const newScrollHeight = chatMessagesEl.scrollHeight;
                chatMessagesEl.scrollTop = (newScrollHeight - prevScrollHeight) + prevScrollTop;
            }
        }

        // Solicitar a WhatsApp Web scroll hacia arriba para traer más mensajes
        if (state.activeChat && state.socket && state.socket.readyState === WebSocket.OPEN) {
            btnLoadMoreMsgs.textContent = 'Cargando de WhatsApp Web...';
            state.socket.send(JSON.stringify({
                type: 'LOAD_OLDER_MESSAGES',
                accountId: state.activeChat.accountId,
                phone: state.activeChat.leadPhone || state.activeChat.phone,
                name: state.activeChat.name
            }));
        }
    });
}


function getSenderColor(name) {
    if (!name) return '#0284c7';
    const colors = ['#0284c7', '#d97706', '#7c3aed', '#059669', '#dc2626', '#db2777', '#4f46e5', '#0891b2', '#ea580c', '#0d9488'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function appendMessageBubble(msg, autoScroll = true) {
    if (!msg || (!msg.text && !msg.mediaUrl)) return;
    let cleanText = String(msg.text || '').trim();

    if (cleanText.startsWith('/9j/') || cleanText.startsWith('data:image') || (cleanText.length > 250 && !cleanText.includes(' '))) {
        cleanText = '(Documento adjunto)';
    }

    // Si había un mensaje de "Cargando..." o "Sin mensajes", limpiarlo
    const placeholder = messagesContainer.querySelector('div[style*="text-align: center"]');
    if (placeholder) {
        placeholder.remove();
    }

    // Clave de deduplicación exacta: autor + id o timestamp + texto normalizado
    const dedupeKey = msg.id || `${Boolean(msg.fromAgent)}::${msg.time || ''}::${(cleanText || msg.mediaUrl || '').toLowerCase()}`;
    if (state.renderedMessageKeys.has(dedupeKey)) {
        return; // Descartar duplicado
    }
    // Evitar que el eco de WhatsApp o doble evento duplique un mensaje recién enviado por el asesor
    if (msg.fromAgent) {
        const existingOutBubbles = messagesContainer.querySelectorAll('.message-row.out');
        for (let i = existingOutBubbles.length - 1; i >= 0; i--) {
            const rowEl = existingOutBubbles[i];
            const textEl = rowEl.querySelector('.bubble-text');
            const bubbleText = textEl ? textEl.textContent.trim() : '';
            const isTemp = !rowEl.id || rowEl.id.startsWith('msg_') || Boolean(rowEl.querySelector('.bubble-status.sending'));
            if (bubbleText === cleanText && (isTemp || rowEl.id === msg.id)) {
                if (msg.id) {
                    state.renderedMessageKeys.add(msg.id);
                    rowEl.id = msg.id;
                }
                const statusEl = rowEl.querySelector('.bubble-status');
                if (statusEl && (msg.status === 'sent' || !msg.status)) {
                    statusEl.className = 'bubble-status';
                    statusEl.textContent = '✓✓';
                }
                return;
            }
        }
    }

    state.renderedMessageKeys.add(dedupeKey);

    const row = document.createElement('div');
    row.className = `message-row ${msg.fromAgent ? 'out' : 'in'}`;
    if (msg.id) row.id = msg.id;

    const timeStr = msg.timeStr || formatTimeDisplay(msg.time);
    let statusMark = '';
    if (msg.fromAgent) {
        if (msg.status === 'sent') statusMark = '<span class="bubble-status" title="Entregado y visto">✓✓</span>';
        else if (msg.status === 'sending') statusMark = '<span class="bubble-status sending" title="Enviando...">...</span>';
        else if (msg.status === 'error') statusMark = '<span class="bubble-status error" title="Error al enviar">!</span>';
    }

    // Identificar y mostrar quién envió el mensaje
    let senderHtml = '';
    if (msg.fromAgent) {
        const agentName = msg.sender || 'Tú';
        senderHtml = `<div class="bubble-sender out-sender">${escapeHtml(agentName)}</div>`;
    } else {
        const isGroup = (state.activeModule === 'backdata') || Boolean(state.activeChat?.isGroup) || (state.activeChat?.jid && state.activeChat.jid.endsWith('@g.us')) || Boolean(msg.groupSender);
        const senderName = isGroup ? (msg.groupSender || msg.sender || msg.author || msg.pushName || '') : '';
        if (isGroup && senderName && senderName !== 'Cliente' && !/^\d{13,20}$/.test(senderName)) {
            const color = getSenderColor(senderName);
            senderHtml = `<div class="bubble-sender in-sender" style="color: ${color};">${escapeHtml(senderName)}</div>`;
        }
    }

    const mediaHtml = msg.mediaUrl ? `
        <div class="bubble-media-wrap">
            <img src="${escapeHtml(waUrl(msg.mediaUrl))}" class="bubble-media-img" loading="lazy" alt="Foto adjunta" title="Clic para ampliar en pestaña nueva" onclick="window.open(this.src,'_blank')" />
        </div>
    ` : '';

    const isGenericLabel = cleanText === '(Foto)' || cleanText === '(Imagen)' || cleanText === '(Documento adjunto)' || cleanText === '(Sticker)';
    const textHtml = (cleanText && (!msg.mediaUrl || !isGenericLabel)) ? `<div class="bubble-text">${formatWhatsAppText(cleanText)}</div>` : '';

    row.innerHTML = `
        <div class="bubble">
            ${senderHtml}
            ${mediaHtml}
            ${textHtml}
            <div class="bubble-meta">
                <span class="bubble-time">${escapeHtml(timeStr)}</span>
                ${statusMark}
            </div>
        </div>
    `;

    messagesContainer.appendChild(row);
    if (autoScroll && chatMessagesEl) {
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }
}

function updateMessageBubbleStatus(messageId, status, errorReason) {
    const row = document.getElementById(messageId);
    if (!row) return;
    const statusEl = row.querySelector('.bubble-status');
    if (!statusEl) return;

    if (status === 'sent') {
        statusEl.className = 'bubble-status';
        statusEl.textContent = '✓✓';
    } else if (status === 'error') {
        statusEl.className = 'bubble-status error';
        statusEl.textContent = '!';
        statusEl.title = errorReason || 'Error al enviar';
    }
}

// ==================== RESPUESTAS RÁPIDAS ====================
function renderQuickReplies() {
    // Este HTML no trae el contenedor de respuestas rapidas: sin esta guarda el error cortaba
    // el evento STATE antes de renderAll() y el tablero no se dibujaba al cargar.
    if (!quickChips) return;
    quickChips.innerHTML = '';
    (state.quickReplies || []).forEach(qr => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'quick-chip';
        // Limpiar cualquier emoji residual para mantener diseño 100% sobrio y corporativo
        const cleanTitle = String(qr.title || '').replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
        chip.textContent = cleanTitle || qr.title;
        chip.title = qr.text;
        chip.addEventListener('click', () => {
            composerInput.value = qr.text;
            composerInput.focus();
        });
        quickChips.appendChild(chip);
    });
}

// ==================== ENVÍO DE MENSAJES ====================
composerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
});

composerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

let isSendingMessage = false;

function sendMessage() {
    if (isSendingMessage) return;
    if (!state.activeChat) return;
    const text = composerInput.value.trim();
    if (!text) return;

    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
        alert('Sin conexión al servidor. Reconectando...');
        return;
    }

    isSendingMessage = true;
    setTimeout(() => { isSendingMessage = false; }, 600);

    // Trasladar automáticamente a Seguimiento / Atendido al responder
    if (state.activeChat) {
        state.activeChat.leadStatus = 'attended';
        state.activeChat.stage = 'attended';
        const activeChatStageSelect = document.getElementById('active-chat-stage-select');
        if (activeChatStageSelect) activeChatStageSelect.value = 'attended';

        const queueItem = state.queue.find(q => q.accountId === state.activeChat.accountId && ((q.leadPhone && q.leadPhone === state.activeChat.leadPhone) || q.name === state.activeChat.name));
        if (queueItem) {
            queueItem.leadStatus = 'attended';
            queueItem.stage = 'attended';
        }
        renderAll();
    }

    state.socket.send(JSON.stringify({
        type: 'SEND_MESSAGE',
        chatKey: state.activeChat.chatKey,
        accountId: state.activeChat.accountId,
        phone: state.activeChat.leadPhone || state.activeChat.phone || state.activeChat.name || '',
        name: state.activeChat.name || '',
        text
    }));

    composerInput.value = '';
    composerInput.style.height = '40px';
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupKanbanDragAndDrop();
});




