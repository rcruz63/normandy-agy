# Identidades del repositorio (personal)

Este es un repositorio **personal**. Las siguientes identidades son obligatorias
para todas las operaciones, en todas las sesiones.

## Git y GitHub

- Autoría de commits: **Raul de la Cruz <rpublico@gmail.com>** (fijada en la
  config local del repo).
- Cuenta de GitHub para push/pull: **`rcruz63`**.
- El remoto `origin` usa `https://rcruz63@github.com/rcruz63/normandy.git` para
  forzar la resolución de credenciales hacia `rcruz63`.
- **La cuenta profesional (`RCRUZ2_mapfre`) suele estar activa en `gh` durante
  la jornada laboral.** NUNCA se debe asumir que la cuenta activa de `gh` es la
  correcta. Este repo debe operar siempre como `rcruz63` con independencia de la
  cuenta activa, apoyándose en el keychain de macOS / Git Credential Manager y
  en `credential.useHttpPath=true`.
- Las operaciones de red se ejecutan con `GIT_TERMINAL_PROMPT=0` para que fallen
  rápido en vez de quedarse colgadas pidiendo credenciales de forma interactiva.
- Si un push falla por credencial de `rcruz63` caducada, hay que **reclamar al
  usuario** que la refresque; no intentar autenticar con otra cuenta.

## AWS

- Usar **siempre** el profile `casa` (cuenta personal): `--profile casa` o
  `AWS_PROFILE=casa`.
- No usar la cuenta/credenciales profesionales para nada de este proyecto.
- Si el token/credencial de `casa` no funciona, **reclamar al usuario** que lo
  actualice; no hacer fallback a otro perfil.

## Automatismo de commits

- Un hook `PostTaskExec` ejecuta `scripts/commit-and-push.sh` al completar cada
  tarea de la spec: verifica la identidad de autoría y que `origin` apunte a
  `rcruz63`, hace commit y push a la rama actual, y aborta con aviso si algo no
  cuadra.
