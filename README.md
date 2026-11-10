# SyncCall

Aplicación web de mensajería y llamadas de voz en tiempo real con amigos, grupos y canales, inspirada en Discord. Full-stack en TypeScript.

## Demo

Demo en línea: https://synccall-ss1w.onrender.com/

La primera carga puede tardar hasta un minuto, porque el servicio gratuito se suspende cuando no tiene tráfico.

## Funcionalidades

- Login con Google o GitHub (OAuth), sin contraseñas propias. Sesión con access y refresh token en cookies `httpOnly`.
- Amigos: búsqueda por nombre de usuario, solicitudes (enviar, aceptar, rechazar, cancelar), amigos en común y presencia en tiempo real (en línea, ausente, no molestar, invisible).
- Mensajes directos entre amigos: texto, imágenes y notas de voz. Edición, borrado, reacciones con 6 emojis, indicador de escritura y mensajes no leídos. El primer mensaje queda como solicitud hasta que el destinatario la acepta.
- Grupos de hasta 50 miembros con canales de texto y de voz, roles (owner, admin, member), invitaciones y no leídos por canal.
- Llamadas de voz 1 a 1 desde un DM y llamadas grupales en canales de voz (hasta 8 personas). Incluyen silenciar, ensordecer, compartir pantalla y un widget minimizado. No hay cámara.
- Perfil con foto, banner, biografía, color de acento, marcos de avatar y placas de nombre. Al borrar la cuenta se anonimiza el usuario y sus mensajes quedan.
- Preferencias guardadas en el navegador: silenciar notificaciones (global o por amigo), notificaciones de escritorio y elección de micrófono y salida de audio.

## Stack

- **Backend:** Node.js 20+, Express 4, Socket.IO 4, Passport (Google y GitHub), jsonwebtoken, Zod, Helmet, express-rate-limit, Multer. Build con esbuild.
- **Frontend:** React 18, TypeScript, Vite, React Router 7, Tailwind CSS 3, socket.io-client. Las llamadas usan la API WebRTC del navegador.
- **Base de datos:** MongoDB con Mongoose 8.
- **Infraestructura:** Docker (build multi-stage), Docker Compose para MongoDB local y Cloudinary para imágenes y audio. Desplegado en Render.

## Arquitectura

Monorepo con npm workspaces: `client` (SPA de React), `server` (Express + Socket.IO) y `shared` (tipos, esquemas Zod y nombres de eventos de socket usados por ambos). En el servidor cada módulo (`auth`, `users`, `friends`, `conversations`, `groups`, `messages`) separa modelo, servicio, controlador y rutas. El cliente habla con la API por REST con cookies (envía `X-Requested-With` en las mutaciones y renueva la sesión ante un 401) y mantiene una conexión Socket.IO autenticada con la misma cookie. Cada usuario entra a una sala propia (`user:<id>`) y a una por grupo (`group:<id>`); los eventos en tiempo real se emiten a esas salas. En producción el mismo proceso Express sirve la API y el cliente compilado.

## Decisiones técnicas

- **Llamadas WebRTC en malla, sin servidor de medios.** Cada participante abre una conexión directa con los demás y el servidor solo retransmite la señalización (`call:signal`). Evita montar un SFU para grupos chicos. El costo es que la subida crece con cada participante, por eso el tope de 8.
- **Operaciones atómicas de MongoDB en vez de leer, modificar y guardar.** El límite de 50 miembros se aplica con `$expr` y `$size` dentro del `$push`. Las solicitudes de amistad cruzadas (A a B y B a A) se bloquean con una clave de par sin dirección (`pairKey`) con índice único. Los tests de concurrencia encontraron estas condiciones de carrera.
- **Mensajes cifrados en reposo.** El contenido se guarda con AES-256-GCM y un IV aleatorio por mensaje. Protege ante un volcado de la base, pero no es cifrado extremo a extremo: el servidor tiene la clave.
- **`shared` sin paso de build propio.** Cliente y servidor importan los mismos tipos y esquemas, así que una regla de validación cambia en un solo lugar. El build del servidor empaqueta `shared` dentro de `server/dist/server.js` con esbuild, porque Node no ejecuta TypeScript.

## Cómo correrlo

Requisitos: Node.js 20 o superior, MongoDB (el `docker-compose.yml` levanta uno), credenciales OAuth de Google y una cuenta de Cloudinary. GitHub es opcional.

```bash
npm install
cp server/.env.example server/.env   # completar los valores
cp client/.env.example client/.env
docker compose up -d                 # MongoDB en localhost:27017
npm run dev                          # server en :5000, client en :5173
```

Otros comandos: `npm run build` (typecheck y build de server y client), `npm run typecheck`, `npm run lint`. Con `NODE_ENV=production`, `npm run start -w server` sirve la API y el cliente compilado. El `Dockerfile` hace el mismo build y arranca `node server/dist/server.js`.

Los secretos JWT y la clave de cifrado se pueden generar con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Variables de `server/.env`** (solo nombres, ver `server/.env.example`):

- `NODE_ENV`, `PORT`: entorno y puerto (por defecto `development` y `5000`).
- `CLIENT_ORIGIN`: URL del frontend, usada para CORS y para redirigir tras el login.
- `MONGODB_URI`: conexión a MongoDB.
- `JWT_SECRET`, `JWT_EXPIRES_IN`: secreto (mínimo 32 caracteres) y duración del access token (por defecto `15m`).
- `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`: lo mismo para el refresh token (por defecto `7d`).
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`: OAuth de Google (obligatorias).
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`: OAuth de GitHub. Sin ID y secret no se habilita el login con GitHub.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: subida de imágenes y audio.
- `MESSAGE_ENCRYPTION_KEY`: clave AES de 32 bytes en hexadecimal (64 caracteres).

**Variables de `client/.env`:**

- `VITE_API_BASE_URL`: URL base de la API (por defecto `/api`).
- `VITE_SOCKET_URL`: URL del servidor de Socket.IO (sin valor, usa el mismo origen).

## Tests

```bash
npm run test -w server
```

Son 189 tests en 11 archivos, con Vitest y Supertest sobre MongoDB en memoria (`mongodb-memory-server`, que puede descargar el binario la primera vez). Cubren auth y JWT, amistades, grupos, mensajes y el ciclo de vida de las llamadas (con un socket simulado), incluidos escenarios de concurrencia y de capacidad. No usan Google ni Cloudinary, pero la configuración se valida al cargar: `server/.env` necesita todas las variables, aunque sean de relleno.

El cliente todavía no tiene tests: su script usa `--passWithNoTests`, así que `npm test` en la raíz corre solo los del servidor.

## Próximos pasos

- Tests del cliente y de las rutas de subida de archivos (hoy no tienen cobertura).
- Servidor TURN: hoy se usa solo STUN público de Google, y detrás de un NAT simétrico o un firewall estricto las llamadas pueden no conectar.
- Cámara en las llamadas: hoy hay audio y pantalla compartida.
- Escalado horizontal: la presencia, el registro de llamadas y el límite de mensajes por socket viven en memoria del proceso, así que el servidor corre en una sola instancia.
- Notificaciones push del navegador: hoy solo hay notificaciones de escritorio con la pestaña abierta.

## Autor

Lautaro Pietrantonio - [LinkedIn](https://www.linkedin.com/in/lautaro-pietrantonio-803731365/)
