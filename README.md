# Paramita | Seguimiento de Movimientos

Dashboard operativo de consulta para el seguimiento de OT procesadas por Paramita. Está construido con React, TypeScript, Vite y CSS, y preparado para AWS Amplify Hosting.

## Ejecutar localmente

```bash
npm install
cp .env.example .env
npm run dev
```

La aplicación consulta el Lambda Function URL configurado por defecto. Puedes sobrescribirlo con:

```env
VITE_PARAMITA_API_URL=https://tu-api.example.com
```

La capa `src/services/paramitaApi.ts` consume `GET /dashboard` y `GET /orders/{caseId}`. El listado se obtiene desde `orders` dentro de `/dashboard`; los filtros y la paginación se aplican sobre ese resultado. El navegador nunca se conecta directamente a DynamoDB.

## Build y Amplify

```bash
npm run build
```

Publica la carpeta `dist` en Amplify Hosting. Para una SPA, configura el rewrite de todas las rutas a `/index.html` si posteriormente se agregan rutas dedicadas.
