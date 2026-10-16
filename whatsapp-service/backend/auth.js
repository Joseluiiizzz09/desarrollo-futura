const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class AuthManager {
    constructor(dataDir) {
        this.dataDir = dataDir;
        this.usersFile = path.join(dataDir, 'users.json');
        this.sessions = new Map(); // token -> { userId, username, name, role, createdAt, expiresAt }
        this.kronoUsers = new Map(); // userId -> usuario de Krono verificado
        this.SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
        this.initUsers();
    }

    initUsers() {
        if (!fs.existsSync(this.usersFile)) {
            const adminSalt = crypto.randomBytes(12).toString('hex');
            const adminPassword = process.env.ADMIN_PASSWORD || 'Prizma2026!';
            const adminHash = this.hashPassword(adminPassword, adminSalt);
            const defaultUsers = [
                {
                    id: 'usr_admin',
                    username: process.env.ADMIN_USERNAME || 'admin',
                    passwordHash: adminHash,
                    salt: adminSalt,
                    name: 'Administrador General',
                    role: 'admin',
                    active: true,
                    createdAt: Date.now()
                }
            ];
            this.saveUsers(defaultUsers);
        }
    }

    loadUsers() {
        try {
            if (!fs.existsSync(this.usersFile)) return [];
            return JSON.parse(fs.readFileSync(this.usersFile, 'utf-8'));
        } catch {
            return [];
        }
    }

    saveUsers(users) {
        try {
            fs.writeFileSync(this.usersFile, JSON.stringify(users, null, 2), 'utf-8');
        } catch (err) {
            console.error('[AUTH] Error guardando usuarios:', err.message);
        }
    }

    hashPassword(password, salt) {
        return crypto.scryptSync(password, salt, 64).toString('hex');
    }

    verifyPassword(password, salt, hash) {
        if (!hash || !salt) return false;
        try {
            const testHash = this.hashPassword(password, salt);
            return Buffer.from(testHash, 'hex').equals(Buffer.from(hash, 'hex'));
        } catch {
            return false;
        }
    }

    authenticate(username, password) {
        const cleanUsername = String(username || '').trim().toLowerCase();
        const cleanPassword = String(password || '').trim();
        if (!cleanUsername || !cleanPassword) {
            return { ok: false, error: 'Usuario y contraseña requeridos' };
        }

        const users = this.loadUsers();
        const user = users.find(u => u.username.toLowerCase() === cleanUsername);
        if (!user) {
            return { ok: false, error: 'Credenciales inválidas' };
        }

        if (!user.active) {
            return { ok: false, error: 'Esta cuenta ha sido desactivada por un administrador' };
        }
        const valid = this.verifyPassword(cleanPassword, user.salt, user.passwordHash);

        if (!valid) {
            return { ok: false, error: 'Credenciales inválidas' };
        }

        // Crear token de sesión
        const token = crypto.randomBytes(32).toString('hex');
        const sessionData = {
            token,
            userId: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            createdAt: Date.now(),
            expiresAt: Date.now() + this.SESSION_TTL_MS
        };
        this.sessions.set(token, sessionData);

        return {
            ok: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role
            }
        };
    }

    // Sesion de Krono: el panel ya no tiene login propio, valida el JWT que emite
    // el backend de Krono (mismo JWT_SECRET). Solo entran los cargos permitidos;
    // jefatura es administrador del panel (cuentas, QR) y backoffice atiende chats.
    getSession(token) {
        if (!token) return null;
        return this.verifyKronoToken(token);
    }

    verifyKronoToken(token) {
        // En FUTURA el backend ya carga JWT_SECRET desde su archivo seguro.
        // Se conserva KRONO_JWT_SECRET para despliegues independientes.
        const secret = process.env.KRONO_JWT_SECRET || process.env.JWT_SECRET;
        if (!secret) return null;
        const parts = String(token).split('.');
        if (parts.length !== 3) return null;
        try {
            const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
            if (header.alg !== 'HS256') return null;
            const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
            const received = Buffer.from(parts[2], 'base64url');
            if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
            if (!payload.exp || Date.now() >= payload.exp * 1000) return null;
            const cargos = [payload.cargo, ...(Array.isArray(payload.permisos) ? payload.permisos : [])]
                .map(cargo => String(cargo || '').trim().toLowerCase());
            const esAdmin = cargos.includes('jefatura');
            if (!esAdmin && !cargos.includes('backoffice')) return null;
            const userId = `krono_${payload.id}`;
            const user = {
                id: userId,
                username: payload.usuario,
                name: payload.usuario,
                role: esAdmin ? 'admin' : 'asesor',
                active: true
            };
            this.kronoUsers.set(userId, user);
            return { token, userId, username: user.username, name: user.name, role: user.role, createdAt: Date.now(), expiresAt: payload.exp * 1000 };
        } catch {
            return null;
        }
    }

    revokeSession(token) {
        if (token) this.sessions.delete(token);
    }

    revokeUserSessions(userId) {
        const revokedTokens = [];
        for (const [token, session] of this.sessions.entries()) {
            if (session.userId === userId) {
                revokedTokens.push(token);
                this.sessions.delete(token);
            }
        }
        return revokedTokens;
    }

    getUserById(userId) {
        if (this.kronoUsers.has(userId)) return this.kronoUsers.get(userId);
        const users = this.loadUsers();
        return users.find(u => u.id === userId) || null;
    }

    getAllUsers(onlineUserIds = new Set()) {
        const users = this.loadUsers();
        return users.map(u => ({
            id: u.id,
            username: u.username,
            name: u.name,
            role: u.role,
            active: u.active,
            createdAt: u.createdAt,
            isOnline: onlineUserIds.has(u.id)
        }));
    }

    createUser({ username, password, name, role = 'asesor' }) {
        const cleanUsername = String(username || '').trim().toLowerCase();
        const cleanPassword = String(password || '').trim();
        const cleanName = String(name || '').trim();

        if (!cleanUsername || !cleanPassword || !cleanName) {
            return { ok: false, error: 'Todos los campos son obligatorios' };
        }
        if (cleanPassword.length < 6) {
            return { ok: false, error: 'La contraseña debe tener mínimo 6 caracteres' };
        }

        const users = this.loadUsers();
        if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
            return { ok: false, error: 'El nombre de usuario ya existe' };
        }

        const salt = crypto.randomBytes(12).toString('hex');
        const passwordHash = this.hashPassword(cleanPassword, salt);
        const newUser = {
            id: 'usr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            username: cleanUsername,
            passwordHash,
            salt,
            name: cleanName,
            role: role === 'admin' ? 'admin' : 'asesor',
            active: true,
            createdAt: Date.now()
        };

        users.push(newUser);
        this.saveUsers(users);

        return {
            ok: true,
            user: {
                id: newUser.id,
                username: newUser.username,
                name: newUser.name,
                role: newUser.role,
                active: newUser.active
            }
        };
    }

    updateUser(userId, { name, password, role }) {
        const users = this.loadUsers();
        const user = users.find(u => u.id === userId);
        if (!user) return { ok: false, error: 'Usuario no encontrado' };

        if (name) user.name = String(name).trim();
        const previousRole = user.role;
        if (role && (role === 'admin' || role === 'asesor')) user.role = role;
        if (password) {
            const cleanPass = String(password).trim();
            if (cleanPass.length < 6) return { ok: false, error: 'Contraseña mínima de 6 caracteres' };
            user.salt = crypto.randomBytes(12).toString('hex');
            user.passwordHash = this.hashPassword(cleanPass, user.salt);
            this.revokeUserSessions(userId); // invalidar sesiones viejas al cambiar clave
        }

        this.saveUsers(users);
        if (typeof previousRole !== 'undefined' && user.role !== previousRole) this.revokeUserSessions(userId);
        return { ok: true, user: { id: user.id, username: user.username, name: user.name, role: user.role, active: user.active } };
    }

    toggleUserActive(userId) {
        const users = this.loadUsers();
        const user = users.find(u => u.id === userId);
        if (!user) return { ok: false, error: 'Usuario no encontrado' };
        if (user.username === 'admin') return { ok: false, error: 'No se puede desactivar el administrador principal' };

        user.active = !user.active;
        this.saveUsers(users);

        if (!user.active) {
            this.revokeUserSessions(userId);
        }

        return { ok: true, active: user.active };
    }

    deleteUser(userId) {
        const users = this.loadUsers();
        const user = users.find(u => u.id === userId);
        if (!user) return { ok: false, error: 'Usuario no encontrado' };
        if (user.username === 'admin') return { ok: false, error: 'No se puede eliminar el administrador principal' };

        const filtered = users.filter(u => u.id !== userId);
        this.saveUsers(filtered);
        this.revokeUserSessions(userId);

        return { ok: true };
    }
}

module.exports = AuthManager;



