#!/usr/bin/env bash
# Hook PostTaskExec: hace commit de los cambios y push a origin.
# Recibe por stdin el contexto de sesión en JSON (no imprimimos su contenido).
#
# Identidad OBLIGATORIA de este repositorio personal:
#   - Autoría git: Raul de la Cruz <rpublico@gmail.com>
#   - Cuenta GitHub para el push: rcruz63 (fijada en la URL del remoto)
# La cuenta profesional puede estar activa en `gh`; por eso NO dependemos de la
# cuenta activa: la credencial se resuelve por keychain/GCM con useHttpPath.
set -euo pipefail

EXPECTED_EMAIL="rpublico@gmail.com"

# Consumir stdin para no bloquear al proceso llamante.
payload="$(cat || true)"

# Situarse en la raíz del repositorio.
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "${repo_root}" ]; then
  echo "No es un repositorio git; se omite el commit." >&2
  exit 0
fi
cd "${repo_root}"

# Nada que confirmar.
if [ -z "$(git status --porcelain)" ]; then
  echo "No hay cambios que confirmar."
  exit 0
fi

# Verificar identidad de autoría personal antes de commitear.
current_email="$(git config user.email || true)"
if [ "${current_email}" != "${EXPECTED_EMAIL}" ]; then
  echo "ERROR: la identidad de git es '${current_email}', se esperaba '${EXPECTED_EMAIL}'." >&2
  echo "Ejecuta: git config --local user.email \"${EXPECTED_EMAIL}\"" >&2
  exit 1
fi

# Verificar que el remoto apunta a la cuenta personal rcruz63.
origin_url="$(git remote get-url origin 2>/dev/null || true)"
case "${origin_url}" in
  https://rcruz63@github.com/\*\) : ;;
  *)
    echo "ERROR: origin es '${origin_url}'; se esperaba https://rcruz63@github.com/..." >&2
    echo "Ejecuta: git remote set-url origin https://rcruz63@github.com/rcruz63/normandy.git" >&2
    exit 1
    ;;
esac

# Extraer el nombre de la tarea del payload si viene, sin fallar si no está.
task_name="$(printf '%s' "${payload}" | sed -n 's/.*"taskName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
if [ -z "${task_name}" ]; then
  task_name="tarea completada"
fi

git add -A
git commit -m "chore: ${task_name}" -m "Commit automatico al completar una tarea de la spec fields-of-normandy-pwa."

# Push sin prompts interactivos: si la credencial de rcruz63 no esta disponible,
# falla rapido en vez de colgarse. En ese caso el usuario debe refrescarla.
branch="$(git rev-parse --abbrev-ref HEAD)"
if GIT_TERMINAL_PROMPT=0 git push origin "${branch}"; then
  echo "Commit y push completados en ${branch} como rcruz63."
else
  echo "ERROR: el commit se creo pero el push a origin (${branch}) fallo." >&2
  echo "Probable credencial de rcruz63 caducada. Refrescala y ejecuta: git push origin ${branch}" >&2
  exit 1
fi
