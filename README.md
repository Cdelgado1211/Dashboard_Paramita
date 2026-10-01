# Paramita | Seguimiento de Movimientos

Dashboard operativo de consulta para el seguimiento de OT procesadas por Paramita. Está construido con React, TypeScript, Vite y CSS, y preparado para AWS Amplify Hosting.

## Ejecutar localmente

```bash
npm install
cp .env.example .env
npm run dev
```

Configura los endpoints del entorno en `.env` o en las variables de entorno de Amplify:

```env
VITE_API_URL=
VITE_OIDC_ORIGIN=
VITE_DANA_PARENT_ORIGIN=
VITE_WS_URL=
```

El flujo BFF procesa el fragmento temporal `#auth_code` y lo intercambia una sola vez mediante `POST /auth/finalize`. Solo el `sessionId` opaco se guarda en `sessionStorage` bajo `paramita_session`; no se guardan tokens DANA ni credenciales en `localStorage`.

Las requests protegidas usan el header:

```text
Authorization: Session <sessionId>
```

La capa `src/services/paramitaApi.ts` consume `GET /dashboard` y `GET /orders/{caseId}`. El listado se obtiene desde `orders` dentro de `/dashboard`; los filtros y la paginación se aplican sobre ese resultado. El navegador nunca se conecta directamente a DynamoDB.

## Requisitos del backend

CORS debe permitir el origen exacto del frontend del entorno correspondiente:

- Methods: `GET`, `POST`, `OPTIONS`
- Headers: `Authorization`, `Content-Type`, `Accept`

El frontend no encontró una política `Content-Security-Policy` en este repositorio. Si se configura CSP en Amplify o en el edge, `connect-src` debe incluir únicamente el origen HTTPS de `VITE_API_URL` y el origen WSS de `VITE_WS_URL`; no agregar `unsafe-eval`. Como `sessionStorage` contiene una credencial de sesión, conviene mantener una CSP estricta y evitar scripts inline.

El logout OIDC usa `POST /auth/logout/initiate` con `Authorization: Session ...`, limpia la sesión local y navega a `/auth/logout/continue?code=...` usando únicamente el código efímero de handoff. El logout local `/auth/local-logout` continúa separado y también se ejecuta mediante una request autenticada.

## Build y Amplify

```bash
npm run build
```

Publica la carpeta `dist` en Amplify Hosting. Para una SPA, configura el rewrite de todas las rutas a `/index.html` si posteriormente se agregan rutas dedicadas.
