#!/usr/bin/env bash
# Hook PostTaskExec: hace commit de los cambios y push a origin/main.
# Recibe por stdin el contexto de sesión en JSON (no imprimimos su contenido).
set -euo pipefail

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

# Extraer el nombre de la tarea del payload si viene, sin fallar si no está.
task_name="$(printf '%s' "${payload}" | sed -n 's/.*"taskName"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
if [ -z "${task_name}" ]; then
  task_name="tarea completada"
fi

git add -A
git commit -m "chore: ${task_name}" -m "Commit automático al completar una tarea de la spec fields-of-normandy-pwa."

# Push a la rama actual con tracking en origin.
branch="$(git rev-parse --abbrev-ref HEAD)"
git push -u origin "${branch}"
echo "Commit y push completados en ${branch}."
