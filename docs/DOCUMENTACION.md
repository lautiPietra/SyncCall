# SyncCall — Documentación Técnica

**Plataforma de mensajería y llamadas de voz en tiempo real**
Versión del documento: 1.1 · Última actualización: 10 de noviembre de 2026

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Arquitectura del sistema](#3-arquitectura-del-sistema)
4. [Módulos y funcionalidades](#4-módulos-y-funcionalidades)
5. [Modelo de datos](#5-modelo-de-datos)
6. [API REST](#6-api-rest)
7. [Comunicación en tiempo real (WebSockets)](#7-comunicación-en-tiempo-real-websockets)
8. [Seguridad](#8-seguridad)
9. [Límites de capacidad y rendimiento](#9-límites-de-capacidad-y-rendimiento)
10. [Estrategia de testing](#10-estrategia-de-testing)
11. [Infraestructura y despliegue](#11-infraestructura-y-despliegue)
12. [Decisiones de diseño y trade-offs](#12-decisiones-de-diseño-y-trade-offs)
13. [Limitaciones conocidas y roadmap](#13-limitaciones-conocidas-y-roadmap)

---

## 1. Resumen ejecutivo

**SyncCall** es una aplicación web full-stack de mensajería y comunicación en tiempo real, con una interfaz inspirada en Discord. Permite a los usuarios autenticarse con Google o GitHub, agregar amigos, crear grupos con múltiples canales de texto y voz, enviar mensajes de texto/imagen/audio cifrados en la base de datos, y realizar llamadas de voz 1 a 1 o grupales con pantalla compartida (sin cámara) — todo con actualización en tiempo real vía WebSockets.

El proyecto está construido como un **monorepo TypeScript** con tres paquetes (`client`, `server`, `shared`), pensado y desarrollado siguiendo prácticas de ingeniería de software profesional:

- Tipado estricto de punta a punta (los mismos esquemas de validación y tipos se comparten entre frontend y backend).
- Cifrado en reposo de todos los mensajes.
- Suite de **189 tests automatizados** que no solo verifican funcionalidad sino que reproducen condiciones de carrera (race conditions) y prueban límites de capacidad reales bajo concurrencia.
- Contenerización con Docker y despliegue continuo (CD) a un entorno productivo real.

Este documento describe la arquitectura completa, cada módulo funcional, el modelo de datos, la API, los mecanismos de seguridad, los límites de capacidad medidos y verificados, y las decisiones de diseño detrás del proyecto.

---

## 2. Stack tecnológico

### Frontend (`client/`)

| Tecnología | Versión | Uso |
|---|---|---|
| React | 18.3 | Librería de UI |
| TypeScript | 5.5 | Tipado estático |
| Vite | 8.2 | Bundler y dev server |
| React Router | 7.18 | Ruteo del lado del cliente (SPA) |
| Tailwind CSS | 3.4 | Estilos utility-first |
| Socket.IO Client | 4.7 | Comunicación en tiempo real |
| Vitest + Testing Library | — | Instalados y configurados (jsdom), pero el cliente todavía no tiene tests |

### Backend (`server/`)

| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | ≥20 | Runtime |
| Express | 4.19 | Framework HTTP |
| TypeScript | 5.5 | Tipado estático |
| MongoDB + Mongoose | 8.5 | Base de datos y ODM |
| Socket.IO | 4.7 | Servidor de WebSockets |
| Passport.js | 0.7 | Autenticación OAuth (Google / GitHub) |
| jsonwebtoken | 9.0 | Emisión y verificación de JWT |
| Zod | 3.23 | Validación de esquemas (compartida con el cliente) |
| Helmet | 7.1 | Cabeceras de seguridad HTTP / CSP |
| express-rate-limit | 7.4 | Limitación de tasa de requests |
| Multer + Cloudinary | — | Subida y hosting de imágenes/audio |
| esbuild | 0.28 | Empaquetado del build de producción |
| Vitest + Supertest + mongodb-memory-server | — | Testing de integración contra una base real en memoria |

### Paquete compartido (`shared/`)

Contiene los **tipos TypeScript** y **esquemas de validación Zod** usados tanto por el cliente como por el servidor (definiciones de `User`, `Message`, `Group`, eventos de sockets, reglas de validación de formularios, etc.). Esto garantiza que el frontend y el backend nunca se desincronicen sobre la forma de los datos: un cambio en una regla de validación se refleja automáticamente en ambos lados sin duplicar código.

### Infraestructura

| Servicio | Uso |
|---|---|
| Docker | Contenerización (build multi-stage) |
| Render | Hosting del contenedor (backend + frontend servido desde el mismo proceso) |
| MongoDB Atlas | Base de datos gestionada (cluster M0) |
| Cloudinary | CDN y almacenamiento de imágenes/audio |
| GitHub | Control de versiones y disparador de despliegue continuo |

---

## 3. Arquitectura del sistema

### 3.1 Estructura del monorepo

```
SyncCall/
├── client/          # SPA de React
│   └── src/
│       ├── app/          # Providers de contexto global (Auth, Friends, Groups, Calls, Sockets...)
│       ├── features/      # Un directorio por dominio: auth, friends, groups, chat, calls, profile
│       └── components/ui/ # Componentes de UI reutilizables (Avatar, Button, Input, etc.)
├── server/          # API + servidor de sockets
│   └── src/
│       ├── features/      # Un directorio por dominio: cada uno con .model / .service / .controller / .routes
│       ├── sockets/        # Handlers de Socket.IO, registro de llamadas, presencia, rate limiter
│       ├── middleware/     # Auth, CSRF, validación, rate limiting, manejo de errores
│       ├── lib/             # Cifrado, sanitización, ApiError
│       └── config/         # Variables de entorno, conexión a DB, Passport, Cloudinary
├── shared/          # Tipos y esquemas Zod compartidos
└── Dockerfile        # Build multi-stage: compila los 3 paquetes y sirve todo desde un solo contenedor
```

Cada dominio del backend sigue el mismo patrón en capas:

```
feature/
├── feature.model.ts       # Esquema de Mongoose
├── feature.types.ts        # Tipos TypeScript del documento
├── feature.service.ts       # Lógica de negocio (la única capa que toca la base de datos)
├── feature.controller.ts    # Adaptador HTTP: parsea el request, llama al service, arma la respuesta
└── feature.routes.ts        # Definición de rutas Express + middlewares aplicados
```

### 3.2 Flujo de una request típica

```
Cliente (fetch) → Express → helmet (CSP) → CORS → rate limiter global
   → CSRF → router del módulo → validate(zod schema) → requireAuth (JWT)
   → controller → service (lógica + Mongo) → respuesta JSON
```

### 3.3 Flujo de comunicación en tiempo real

```
Cliente (Socket.IO client) → handshake con cookie JWT → servidor verifica el token
   → socket se une a las rooms `user:<id>` y `group:<id>` de cada grupo del que es miembro
   → los handlers de socket (mensajes, llamadas, presencia) emiten eventos a esas rooms
```

Cada usuario conectado se une automáticamente a una room privada (`user:<id>`) usada para notificaciones dirigidas (nuevas solicitudes de amistad, actualizaciones de perfil, etc.) y a una room por cada grupo del que es miembro (`group:<id>`), usada para difundir mensajes y eventos de ese grupo a todos sus integrantes conectados.

### 3.4 Arquitectura de las llamadas (WebRTC)

Las llamadas de voz (con pantalla compartida opcional; la app no transmite cámara) usan **WebRTC peer-to-peer**: el servidor **nunca** procesa ni reenvía el audio ni el video de pantalla en sí — solo actúa como intermediario de señalización (offer/answer/ICE candidates vía el evento `call:signal`), sin inspeccionar su contenido. El estado de "quién está en qué llamada" se mantiene en un registro en memoria del proceso (`callRegistry.ts`), no en la base de datos, ya que es un estado transitorio: no tiene sentido persistirlo, y esto evita I/O innecesario a la base de datos en cada evento de la llamada (join/leave/mute).

Para llamadas grupales, cada participante establece una conexión WebRTC directa con cada uno de los demás (topología mesh), con un tope de **8 participantes simultáneos por canal de voz** — límite elegido porque el costo de ancho de banda de subida crece linealmente con cada participante adicional en una topología mesh (sin un servidor de medios/SFU intermediario), por lo que hay un techo práctico razonable antes de que la experiencia se degrade en conexiones domésticas.

---

## 4. Módulos y funcionalidades

### 4.1 Autenticación

- Login exclusivamente vía **OAuth 2.0** con **Google** y **GitHub** (sin contraseñas propias que gestionar ni almacenar).
- Al autenticarse por primera vez, se crea la cuenta automáticamente generando un `username` único a partir del nombre del perfil de OAuth (con reintentos acotados ante colisiones de nombre).
- Sesión gestionada con **dos JWT**: un *access token* de corta duración (15 min, cookie `httpOnly`) y un *refresh token* de larga duración (7 días, cookie `httpOnly` con `path` restringido a `/api/auth`), con renovación automática y transparente desde el cliente cuando el access token vence.
- Borrado de cuenta con "soft delete": el usuario pasa a `Usuario eliminado`, se limpian sus tokens de proveedor OAuth y su avatar, pero sus mensajes ya enviados permanecen (mostrando el remitente como cuenta eliminada), preservando la integridad del historial de conversación de la otra parte.

### 4.2 Amigos

- Sistema de solicitudes de amistad (enviar / aceptar / rechazar / cancelar).
- Búsqueda de usuarios por nombre de usuario, respetando la preferencia de privacidad `visibleInSearch`.
- Preferencia `allowFriendRequests` para bloquear solicitudes entrantes.
- Lista de "amigos mutuos" entre dos cuentas.
- Presencia en tiempo real (en línea / ausente / no molestar / invisible), reflejada al instante en las listas de amigos de cada contacto vía WebSockets.
- Silenciar notificaciones por amigo individual.

### 4.3 Grupos y canales

- Creación de grupos con nombre, descripción y foto.
- Cada grupo tiene **múltiples canales** de tipo texto o voz (estilo Discord), no solo un chat único.
- Sistema de roles: `owner` (dueño, único con permiso de borrar el grupo), `admin` y `member`, con permisos diferenciados para expulsar miembros, gestionar canales y cambiar roles.
- Invitaciones a grupos (a diferencia de las solicitudes de amistad, las envía un miembro existente a un amigo suyo, y éste puede aceptar/rechazar).
- Límite de **50 miembros por grupo**, aplicado de forma atómica (ver sección 9).
- Contador de mensajes no leídos por canal y por grupo.
- Mensajes de sistema automáticos (alguien se fue del grupo, fue expulsado, terminó una llamada).

### 4.4 Mensajería directa (DMs)

- Conversación 1 a 1 por cada par de amigos, creada de forma perezosa (recién al primer mensaje o llamada).
- Solo se puede chatear con amigos: si uno de los dos elimina al otro, el historial sigue visible pero no se pueden enviar mensajes nuevos.
- Sistema de "solicitud de mensaje": el primer mensaje de una conversación queda como solicitud pendiente hasta que el destinatario la acepte, la rechace o responda (responder cuenta como aceptación). Mientras está pendiente, el destinatario no la ve en su lista normal de DMs; si la rechaza, quien la inició no puede seguir escribiéndole, salvo que el destinatario le escriba primero. Evita mensajes no deseados sin llegar a un bloqueo total.
- Tipos de mensaje: texto, imagen, audio (nota de voz) y mensajes de sistema (registro de llamada).
- Edición y borrado de mensajes propios.
- Reacciones con emoji (toggle: reaccionar de nuevo con el mismo emoji la quita).
- Indicador de "escribiendo...".
- Contador de no leídos y marcado como leído.
- Ocultar una conversación de la lista sin borrar el historial.

### 4.5 Mensajería de grupo

Misma base funcional que los DMs (texto/imagen/audio, edición, borrado, paginación, no leídos), aplicada a cada canal de texto de un grupo en vez de a una conversación 1 a 1.

### 4.6 Llamadas de voz y pantalla compartida

- Llamadas 1 a 1 iniciadas desde un DM (invitar / aceptar / rechazar / cancelar / colgar), con detección de "usuario ocupado" si ya está en otra llamada.
- Llamadas grupales por canal de voz: cualquier miembro puede unirse o salir libremente mientras la llamada esté activa, con sincronización en tiempo real de quién está participando.
- Controles: silenciar micrófono, **ensordecer** (dejar de escuchar a los demás sin cortar la llamada), **compartir pantalla**, minimizar la llamada a un widget flotante mientras se sigue navegando la app.
- Señalización WebRTC punto a punto (ver sección 3.4).

### 4.7 Perfil y personalización

- Foto de perfil y banner (subidos a Cloudinary).
- Biografía, color de acento personalizado.
- **Marcos de avatar** decorativos (10 diseños: Aurora, Neón, Oro, Órbita, Hielo, Fuego, Cósmico, Esmeralda, Arcoíris, o ninguno) y **placas de nombre** (nameplates), como sistema de personalización visual.
- Estado de presencia manual (en línea / ausente / no molestar / invisible).

### 4.8 Notificaciones y preferencias

- Silenciar notificaciones globalmente o por conversación/amigo puntual.
- Sonido de notificación configurable.

---

## 5. Modelo de datos

Todas las colecciones viven en MongoDB. A continuación, el detalle de cada una con sus campos e índices reales.

### `User`
| Campo | Tipo | Notas |
|---|---|---|
| `googleId` / `githubId` | String | Índice único *sparse* — cada proveedor es opcional pero si está presente debe ser único |
| `username` | String | Único, requerido |
| `displayName`, `avatarUrl`, `bannerUrl`, `bio`, `accentColor` | String | Perfil visible |
| `avatarFrame`, `nameplate` | enum | Personalización visual |
| `status` | enum: `online / idle / dnd / invisible` | Preferencia manual del usuario |
| `isOnline` | Boolean | Estado real de conexión (ver sección 12 sobre su reconciliación al reiniciar el servidor) |
| `allowFriendRequests`, `visibleInSearch` | Boolean | Preferencias de privacidad |
| `deletedAt` | Date \| null | Soft delete |

### `Friendship`
Relación de amistad ya establecida entre dos usuarios (`userA`, `userB`), con índice único compuesto para impedir duplicados.

### `FriendRequest`
| Campo | Notas |
|---|---|
| `from`, `to` | Dirección original de la solicitud |
| `pairKey` | Clave **sin dirección** (`[menor, mayor].join('_')`), con índice único *sparse* — impide que A→B y B→A queden pendientes simultáneamente aunque se envíen casi al mismo tiempo |
| `status` | `pending / accepted / declined` |

### `Group`
Documento con un subdocumento embebido `members: [{ user, role, joinedAt }]` (sin `_id` propio por miembro). Índices sobre `members.user` (pertenencia) y `owner`.

### `Channel`
Pertenece a un `Group`, con `type: 'text' | 'voice'`. El canal de texto más antiguo de cada grupo actúa como el canal "general" por defecto (por orden de `createdAt`, sin necesidad de un flag `isDefault` separado).

### `GroupInvite`
Invitación pendiente a un grupo, con índice único sobre `(group, invitedUser)` para impedir invitaciones duplicadas mientras la primera sigue sin resolver.

### `GroupChannelRead`
Una fila por `(usuario, canal)` con el contador de no leídos — permite incrementos atómicos (`$inc`) al llegar un mensaje y reseteo al marcar como leído, sin recalcular sobre todo el historial.

### `Conversation`
Conversación DM entre `participantA` y `participantB` (dos campos escalares, no un array — un índice único sobre un array es *multikey* y prohibiría que el mismo usuario aparezca en más de una conversación). Incluye contador de no leídos por lado y el estado de "solicitud de mensaje" (`requestStatus`, `requestedBy`).

### `Message` / `GroupMessage`
Mensaje individual. **El contenido nunca se guarda en texto plano**: se persiste como `ciphertext` + `iv` + `authTag` (ver sección 8.4). Incluye `reactions` (subdocumentos `{ emoji, user }`), soporte de `type` (`text / image / audio / call` en DMs, más `system` en grupos) y borrado lógico (`deleted: true`, no se elimina el documento).

---

## 6. API REST

Todas las rutas (salvo login OAuth) requieren un access token JWT válido (cookie `httpOnly`) vía el middleware `requireAuth`, y pasan por validación de esquema Zod antes de llegar al controller.

### Autenticación — `/api/auth`
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/google` | Inicia el flujo OAuth con Google |
| GET | `/google/callback` | Callback de Google, emite cookies de sesión |
| GET | `/github` | Inicia el flujo OAuth con GitHub |
| GET | `/github/callback` | Callback de GitHub, emite cookies de sesión |
| POST | `/logout` | Limpia las cookies de sesión |
| POST | `/refresh` | Renueva el access token a partir del refresh token |
| GET | `/me` | Devuelve el usuario autenticado actual |

### Usuarios — `/api/users`
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/search` | Busca usuarios por nombre de usuario |
| PATCH | `/me` | Actualiza perfil (nombre, bio, color, marco, preferencias) |
| POST | `/me/avatar` | Sube foto de perfil |
| POST | `/me/banner` | Sube banner de perfil |
| DELETE | `/me` | Elimina la cuenta (soft delete) |

### Amistades — `/api/friend-requests` y `/api/friends`
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/friend-requests` | Lista solicitudes entrantes/salientes |
| POST | `/friend-requests` | Envía una solicitud |
| PATCH | `/friend-requests/:id` | Acepta o rechaza una solicitud |
| DELETE | `/friend-requests/:id` | Cancela una solicitud enviada |
| GET | `/friends` | Lista los amigos actuales |
| GET | `/friends/mutual/:userId` | Amigos en común con otro usuario |
| DELETE | `/friends/:id` | Elimina una amistad |

### Conversaciones (DMs) — `/api/conversations`
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Lista mis conversaciones |
| POST | `/` | Crea/obtiene la conversación con un amigo |
| GET | `/requests` | Solicitudes de mensaje pendientes |
| GET | `/status/:friendId` | Estado de la conversación con un amigo |
| GET | `/:id/messages` | Historial paginado de mensajes |
| POST | `/:id/read` | Marca como leída |
| POST | `/:id/hide` | Oculta la conversación |
| PATCH | `/:id/request` | Acepta/rechaza una solicitud de mensaje |
| POST | `/:id/media` | Sube una imagen al chat |
| POST | `/:id/voice` | Sube una nota de voz |

### Grupos — `/api/groups`
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Lista mis grupos |
| POST | `/` | Crea un grupo |
| GET | `/invites` | Mis invitaciones pendientes a grupos |
| POST | `/invites/:id/respond` | Acepta/rechaza una invitación |
| GET | `/:id` | Detalle de un grupo |
| PATCH | `/:id` | Edita nombre/descripción |
| POST | `/:id/photo` | Sube la foto del grupo |
| DELETE | `/:id` | Elimina el grupo (solo el owner) |
| POST | `/:id/members` | Invita a un miembro |
| DELETE | `/:id/members/:userId` | Expulsa a un miembro |
| PATCH | `/:id/members/:userId/role` | Cambia el rol de un miembro |
| GET | `/:id/invites` | Invitaciones pendientes del grupo |
| DELETE | `/:id/invites/:userId` | Cancela una invitación |
| POST | `/:id/leave` | Abandona el grupo |
| POST | `/:id/channels` | Crea un canal |
| PATCH | `/:id/channels/:channelId` | Edita un canal |
| DELETE | `/:id/channels/:channelId` | Elimina un canal |
| GET | `/:id/channels/:channelId/messages` | Historial paginado del canal |
| POST | `/:id/channels/:channelId/read` | Marca el canal como leído |
| POST | `/:id/channels/:channelId/media` | Sube una imagen al canal |
| POST | `/:id/channels/:channelId/voice` | Sube una nota de voz al canal |

---

## 7. Comunicación en tiempo real (WebSockets)

El servidor expone un único namespace de Socket.IO, autenticado vía la misma cookie JWT que la API REST. Los eventos se agrupan en 4 dominios:

### Mensajes directos
`dm:send`, `dm:typing`, `dm:error`, `message:new`, `message:edit`, `message:delete`, `message:react`, `message:unreact`, `message:updated`, `message-request:new`, `message-request:resolved`, `conversation:updated`

### Mensajes de grupo
`group-message:send`, `group-message:edit`, `group-message:delete`, `group-message:new`, `group-message:updated`, `group:typing`, `group:error`, `group:created`, `group:updated`, `group:deleted`, `group:member-added`, `group:member-removed`, `group:member-role-updated`, `group:channel-created`, `group:channel-updated`, `group:channel-deleted`, `group-invite:new`, `group-invite:resolved`, `group-invite:cancelled`

### Presencia y perfil
`presence:update`, `profile:updated`, `friend-request:new`, `friend-request:accepted`, `friend-request:declined`, `friend-request:cancelled`, `friend:removed`

### Llamadas
`call:invite`, `call:accept`, `call:decline`, `call:cancel`, `call:end`, `call:busy`, `call:error`, `call:group-join`, `call:group-leave`, `call:group-state`, `call:signal` (señalización WebRTC)

Cada evento tiene un tipo de *payload* TypeScript definido en el paquete `shared`, compartido entre cliente y servidor, evitando desincronización de formato entre ambos.

---

## 8. Seguridad

1. **Autenticación**: JWT firmados con `HS256` en cookies `httpOnly` (no accesibles desde JavaScript del cliente, mitigando XSS), con algoritmo restringido explícitamente en la verificación (rechaza tokens `alg: none` u otros algoritmos).
2. **Dos secretos distintos** para access token y refresh token — comprometer uno no compromete el otro.
3. **CSRF**: middleware de protección CSRF sobre las rutas mutables.
4. **CORS**: restringido al origen configurado del cliente, con `credentials: true`.
5. **Content Security Policy** (Helmet): `img-src` explícitamente listado para permitir avatares de Google/GitHub y Cloudinary, resto de directivas en su valor seguro por defecto (`script-src 'self'`, `object-src 'none'`, etc.)
6. **Rate limiting** granular por tipo de acción (ver tabla en sección 9).
7. **Cifrado en reposo (AES-256-GCM)**: el contenido de **todos** los mensajes (DM y de grupo) se cifra antes de guardarse en MongoDB, con un IV aleatorio de 12 bytes por mensaje y verificación de integridad vía *auth tag* (GCM). Esto protege el contenido ante un volcado de base de datos, backup filtrado o credencial de solo lectura comprometida. **No es cifrado extremo a extremo**: el servidor retiene la clave y procesa el texto plano en memoria al enviarlo (aceptable para el modelo de amenaza de esta aplicación, no para uno que requiera zero-knowledge del proveedor).
8. **Validación de entrada**: cada endpoint valida `body` / `params` / `query` contra un esquema Zod antes de ejecutar cualquier lógica de negocio.
9. **Reconciliación de presencia al arrancar**: al iniciar el proceso, se resetean a `false` todos los flags `isOnline` que hayan quedado pegados en `true` por una caída o reinicio previo del servidor sin que el socket llegara a emitir `disconnect` — evita que una cuenta quede marcada "en línea" indefinidamente sin conexión real.

---

## 9. Límites de capacidad y rendimiento

Estos límites no son estimaciones: están codificados explícitamente y **verificados con tests de integración bajo concurrencia real** (sección 10).

| Límite | Valor | Mecanismo |
|---|---|---|
| Miembros por grupo | 50 | Chequeo atómico vía `$expr` + `$size` en el `$push` de Mongo (no hay ventana de carrera entre "leer cupo" y "agregar miembro") |
| Participantes por llamada grupal | 8 | Registro en memoria (`callRegistry`) |
| Largo de un mensaje | 2000 caracteres | Esquema Zod compartido |
| Largo del nombre de un grupo | 50 caracteres | — |
| Descripción de un grupo | 300 caracteres | — |
| Miembros iniciales al crear un grupo | 49 (+ el creador = 50) | — |
| Nombre de usuario | 20 caracteres | — |
| Nombre para mostrar | 32 caracteres | — |
| Biografía de perfil | 190 caracteres | — |
| Paginación de mensajes / conversaciones | 100 por página (por defecto 30–50) | — |
| Rutas de login OAuth (por IP) | 10 intentos / 15 min | `express-rate-limit` |
| Requests generales a la API | 600 / 15 min por usuario (o IP si no autenticado) | Piso general anti-scraping, no un límite de uso normal |
| Búsqueda de usuarios | 30 / minuto | — |
| Solicitudes de amistad enviadas | 20 / hora | — |
| Subida de avatar/banner | 10 / hora | — |
| Subida de imagen/audio al chat | 30 / hora | — |
| Creación de grupos | 10 / hora | — |
| Cambio de foto de grupo | 10 / hora | — |
| Envío de mensajes por socket | Token bucket: 5 de ráfaga, recarga 1 cada 300ms (~3,3 msj/seg sostenido) | En memoria, por usuario conectado |

**Números medidos bajo carga en los tests de integración** (ver sección 10 para detalle):
- **300 sesiones de usuario autenticadas** verificando `/api/auth/me` en paralelo, sin degradación.
- **500 relaciones de amistad** simultáneas para una sola cuenta, listadas correctamente y en menos de 5 segundos.
- **300 solicitudes de amistad entrantes** simultáneas para una cuenta.
- **1200 mensajes** en el historial de una sola conversación DM, paginados correctamente y de forma rápida.
- **1200 mensajes** en el historial de un solo canal de grupo, ídem.
- Grupo con **50 miembros** (el máximo posible) listado con el detalle completo de cada uno, de forma rápida.

---

## 10. Estrategia de testing

El proyecto tiene una suite de **189 tests automatizados** (11 archivos de test), corridos con Vitest + Supertest contra una instancia real de MongoDB en memoria (`mongodb-memory-server`) — no contra mocks. Esto permite reproducir comportamiento real de índices únicos, operaciones atómicas y errores de clave duplicada, exactamente como ocurrirían en producción.

La suite no se limita a verificar el "camino feliz": fue diseñada específicamente para **encontrar y reproducir condiciones de carrera** (race conditions) reales antes de que ocurrieran en producción, siguiendo esta metodología por cada módulo:

1. Leer el código y entender los patrones de escritura a la base de datos.
2. Identificar escenarios de concurrencia realistas propios de ese módulo (dos requests simultáneos que podrían pisarse).
3. Reproducir el escenario sospechoso de forma aislada.
4. Si se confirma un bug real, corregirlo (nunca el test) y volver a verificar.
5. Dejar un test de regresión permanente que documente el bug encontrado y su corrección.

### Bugs de concurrencia reales encontrados y corregidos durante el desarrollo

| Módulo | Bug encontrado | Corrección |
|---|---|---|
| Auth | Registros simultáneos de la misma cuenta OAuth (múltiples pestañas) producían errores 500 sin manejar por clave duplicada | Reintento acotado con recuperación del documento ya creado por la otra request |
| Amistades | Dos solicitudes de amistad en direcciones opuestas (A→B y B→A) enviadas casi al mismo tiempo quedaban ambas pendientes | Clave de par sin dirección (`pairKey`) con índice único |
| Grupos | El límite de 50 miembros podía superarse con aceptaciones de invitación simultáneas | `$expr` + `$size` atómico en el `$push`, en vez de leer-y-luego-escribir |
| Grupos | Remociones simultáneas de miembros producían `VersionError` de Mongoose | `$pull` atómico en vez de mutar el array en memoria y hacer `.save()` |
| Mensajes | Reaccionar y sacar la reacción al mismo tiempo (dos pestañas) producía estado inconsistente o fallos silenciosos | `$pull` + `$push` condicional atómico |

### Cobertura por módulo

- **Auth**: OAuth (Google/GitHub), rate limiting, JWT (incluyendo intentos de bypass: `alg: none`, confusión entre access/refresh token, firma alterada), capacidad de 300 sesiones concurrentes.
- **Amistades**: flujo completo de solicitudes, privacidad, rate limiting, 3 escenarios de carrera, capacidad de 500 amistades / 300 solicitudes.
- **Grupos**: roles y permisos, invitaciones, límite de 50 miembros (incluyendo 5 escenarios de carrera distintos), HTTP-level (CSRF, validación, permisos).
- **Mensajes (DM y grupo)**: cifrado/descifrado, reacciones, edición/borrado, paginación con 1200 mensajes.
- **Llamadas**: ciclo de vida completo de llamadas 1 a 1 y grupales vía un harness de sockets simulado que ejercita los handlers reales contra una base de datos real, multi-pestaña, límite de 8 participantes.

---

## 11. Infraestructura y despliegue

### 11.1 Contenerización

El `Dockerfile` es un build **multi-stage**:

1. **`deps`**: instala dependencias de los 3 workspaces del monorepo (`npm ci`).
2. **`build`**: compila el `server` (TypeScript → esbuild, empaquetando el código del paquete `shared` dentro del bundle final, ya que este último nunca se compila de forma independiente) y el `client` (Vite build).
3. **`runtime`**: imagen final que copia el `node_modules` del stage `deps` (instalado con `npm ci`, por lo que incluye también las devDependencies), el `server/dist` compilado y el `client/dist` compilado — sin el código fuente.

El servidor Express sirve, en producción, tanto la API (`/api/*`) como los archivos estáticos ya compilados del cliente (con *fallback* a `index.html` para las rutas de la SPA), de modo que **todo el sistema corre como un único servicio**, sin necesidad de un hosting separado para el frontend ni configuración de CORS entre dominios distintos.

### 11.2 Despliegue

- **Hosting**: Render (plan gratuito, contenedor Docker desplegado directo desde este repositorio de GitHub).
- **CI/CD**: cada `git push` a la rama `main` dispara automáticamente un nuevo build y despliegue (CD).
- **Base de datos**: MongoDB Atlas (cluster gestionado M0).
- **Imágenes y audio**: Cloudinary (CDN externo).
- **Variables de entorno**: gestionadas fuera del control de versiones, inyectadas por la plataforma de hosting (secretos de OAuth, clave de cifrado, connection string de la base de datos, secretos JWT).

### 11.3 Entorno de desarrollo

- `npm run dev` levanta simultáneamente el servidor (`tsx watch`, con recarga en caliente) y el cliente (Vite dev server) usando `concurrently`.
- `npm run typecheck` / `npm run lint` / `npm run test` corren sobre los 3 workspaces del monorepo desde la raíz.

---

## 12. Decisiones de diseño y trade-offs

Esta sección documenta decisiones de arquitectura tomadas conscientemente, con su justificación — no solo qué se hizo, sino por qué.

- **Operaciones atómicas de Mongo en vez de "leer, modificar en memoria, guardar"**: cualquier operación que dependa de un cupo o una condición (aceptar una invitación cuando el grupo tiene lugar, reaccionar a un mensaje, remover un miembro) se implementa como una única operación atómica de MongoDB (`findOneAndUpdate` con `$expr`, `$push`, `$pull`, posicional `$set`), nunca como "traer el documento completo, mutarlo en JavaScript y llamar `.save()`" — este segundo patrón es vulnerable a *lost updates* bajo concurrencia y fue, de hecho, la causa raíz de todos los bugs de carrera listados en la sección 10 antes de corregirse.
- **`isOnline` como campo persistido, reconciliado al arrancar**: la presencia en tiempo real vive en un mapa en memoria (rápido, sin I/O), pero se refleja también en un campo persistido en Mongo para que la lista de amigos muestre el estado correcto incluso antes de que se establezca la conexión de sockets. El costo de esta duplicación es que un reinicio abrupto del proceso puede dejar cuentas marcadas como "en línea" sin conexión real — por lo que el arranque del servidor **resetea explícitamente** ese estado, tratando el mapa en memoria (vacío al arrancar) como la fuente de verdad.
- **WebRTC mesh sin SFU**: para el tamaño de grupo objetivo de esta aplicación (comunidades de amigos, no salas masivas), un SFU (Selective Forwarding Unit) habría agregado complejidad de infraestructura (un servidor de medios dedicado) sin beneficio real por debajo de las ~8 personas por llamada, límite fijado justamente para no salir de ese rango.
- **Cifrado en reposo, no extremo a extremo**: se eligió proteger contra el vector de amenaza más probable en este contexto (acceso no autorizado a la base de datos) sin la complejidad de gestión de claves por cliente que implica el cifrado E2E real, dado que el servidor de todas formas necesita procesar el contenido para funciones como notificaciones o moderación futura.
- **`shared/` sin paso de build propio**: el paquete de tipos/esquemas compartidos se consume como fuente TypeScript directa tanto en desarrollo (vía `tsx` y Vite, que transforman `.ts` al vuelo) como en el build de producción del cliente (Vite lo empaqueta como cualquier otro módulo). El build de producción del **servidor**, en cambio, corre con Node puro (sin transformador de TypeScript en runtime), por lo que su proceso de build usa esbuild específicamente para empaquetar ese código compartido dentro del bundle final del servidor, en vez de depender de que Node resuelva un paquete de workspace escrito en TypeScript sin compilar.

---

## 13. Limitaciones conocidas y roadmap

Documentadas de forma transparente, como se esperaría de cualquier proyecto de software real:

- **Sin tests automatizados de frontend** todavía: la suite de 189 tests cubre exclusivamente el backend (API, sockets, modelo de datos). El frontend se verifica manualmente.
- **Cifrado no extremo a extremo** (ver sección 12) — decisión consciente, no una limitación técnica no contemplada.
- **Llamadas grupales en topología mesh**: limitadas a 8 participantes por el costo de ancho de banda; escalar más allá requeriría introducir un SFU.
- **Hosting en plan gratuito**: en Render el servicio se suspende tras un período sin tráfico, por lo que la primera carga posterior puede tardar hasta un minuto. Además tiene recursos de cómputo limitados (vCPU compartida) frente a un plan pago.
- **Roadmap futuro**: tests automatizados de UI (Playwright/Testing Library E2E), soporte de notificaciones push del navegador, y evaluación de un SFU si el tamaño típico de las llamadas grupales creciera más allá del rango actual.
