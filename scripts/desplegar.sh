#!/usr/bin/env bash
# Despliega la rama futura-desarrollo en el VPS (185.253.152.62:/var/www/futura).
# Uso (desde Git Bash, en la raíz del repo):  bash scripts/desplegar.sh
#
# En el servidor /var/www/futura es un checkout git de futura-desarrollo:
#   - backend:   futura-api.service       (node server.js, puerto 3000)
#   - frontend:  nginx sirve futura-frontend/dist
#   - whatsapp:  futura-whatsapp.service  (whatsapp-service/)
# Solo se reconstruye/reinicia lo que cambió entre el commit desplegado y el nuevo.
set -euo pipefail

HOST="${FUTURA_HOST:-root@185.253.152.62}"
KEY="${FUTURA_KEY:-$HOME/.ssh/futura.pem}"
BRANCH="futura-desarrollo"

# 1. Local: rama correcta, sin cambios pendientes y todo subido a GitHub
[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || { echo "Estás en otra rama; cambia a $BRANCH"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Hay cambios sin commitear"; exit 1; }
git fetch -q origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/$BRANCH)" ] || { echo "HEAD local != origin/$BRANCH; haz push/pull antes"; exit 1; }

# 2. Servidor
ssh -i "$KEY" -o BatchMode=yes "$HOST" BRANCH="$BRANCH" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /var/www/futura
as_futura() { runuser -u futura -- "$@"; }

# No pisar cambios hechos directo en producción (se ignoran diferencias solo de CRLF)
if ! as_futura git diff --ignore-cr-at-eol --quiet; then
  echo "Producción tiene cambios sin commitear:"; as_futura git diff --ignore-cr-at-eol --stat; exit 1
fi

OLD=$(as_futura git rev-parse HEAD)
as_futura git fetch -q origin
as_futura git merge --ff-only -q "origin/$BRANCH"
NEW=$(as_futura git rev-parse HEAD)
if [ "$OLD" = "$NEW" ]; then echo "Producción ya está en $NEW; nada que desplegar"; exit 0; fi
echo "Desplegando ${OLD:0:7} -> ${NEW:0:7}"
CHANGED=$(as_futura git diff --name-only "$OLD" "$NEW")
echo "$CHANGED" | sed 's/^/  /'

changed() { echo "$CHANGED" | grep -qE "$1"; }

# Backend
if changed '^package-lock\.json$'; then as_futura npm ci --omit=dev; fi
if echo "$CHANGED" | grep -qvE '^(futura-frontend|whatsapp-service|scripts)/'; then
  systemctl restart futura-api.service; echo "futura-api reiniciado"
fi

# Frontend: compilar aparte y cambiar dist al final (nginx nunca ve un dist a medias)
if changed '^futura-frontend/'; then
  cd futura-frontend
  if changed '^futura-frontend/package-lock\.json$'; then as_futura npm ci; fi
  as_futura npx vite build --outDir dist-nuevo --emptyOutDir
  mv dist "../.backups/dist-${OLD:0:7}-$(date +%Y%m%d-%H%M)"
  mv dist-nuevo dist
  cd ..
  echo "Frontend publicado"
fi

# WhatsApp
if changed '^whatsapp-service/'; then
  if changed '^whatsapp-service/package-lock\.json$'; then (cd whatsapp-service && as_futura npm ci --omit=dev); fi
  systemctl restart futura-whatsapp.service; echo "futura-whatsapp reiniciado"
fi

# Comprobación
sleep 3
systemctl is-active --quiet futura-api.service || { echo "futura-api NO está activo"; journalctl -u futura-api -n 30 --no-pager; exit 1; }
CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health)
echo "API /api/health -> HTTP $CODE (401 sin token = OK)"
echo "Listo. Para revertir: cd /var/www/futura && runuser -u futura -- git reset --hard $OLD (y restaurar dist desde .backups)"
REMOTE
