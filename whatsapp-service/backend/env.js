// Carga resources/app/.env en process.env sin dependencias externas.
// Las variables ya definidas en el entorno (p. ej. systemd) tienen prioridad.
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');

try {
    if (fs.existsSync(ENV_FILE)) {
        for (const line of fs.readFileSync(ENV_FILE, 'utf-8').split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
            if (!match || line.trim().startsWith('#')) continue;
            const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
            if (process.env[match[1]] === undefined) process.env[match[1]] = value;
        }
    }
} catch (err) {
    console.error('[ENV] No se pudo leer .env:', err.message);
}
