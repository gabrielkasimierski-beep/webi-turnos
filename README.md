# Asistente de turnos · WEBI (MVP multi-local)

Un asistente de turnos para locales de servicios argentinos. El cliente escanea un QR, chatea (el asistente entiende “el viernes a la tarde”) y saca el turno solo. El dueño ve agenda, caja y recordatorios en su panel.

**Stack:** Next.js 15 (App Router, TypeScript) · Postgres en Neon · Drizzle ORM · desplegable en Vercel. Una sola app para todos los locales.

## Cómo está armado

| Qué | Dónde |
|---|---|
| Chat del cliente (por local) | `/t/[slug]` — el que abre el QR |
| Panel del dueño: agenda + caja + configurar | `/panel` |
| QR imprimible del local | `/panel/qr` |
| Alta de un local / login del dueño | `/registro`, `/login` |
| Esquema de la base | `src/db/schema.ts` (migraciones en `drizzle/`) |
| Reglas de negocio puras (disponibilidad, seña) | `src/lib/negocio.ts` |
| Intérprete de lenguaje natural (sin IA externa) | `src/lib/interprete.ts` |
| Acceso a datos (siempre filtrado por `local_id`) | `src/server/repo.ts` |
| Login OTP + sesión | `src/server/auth.ts` |
| API pública del chat / API privada del panel | `src/app/api/t/[slug]/*` · `src/app/api/panel/*` |

**Aislamiento entre locales:** toda fila lleva `local_id` y toda función de `repo.ts` lo recibe y filtra por él. En `/api/panel/*` el local sale **siempre de la sesión** (cookie firmada), nunca del pedido. En `/api/t/[slug]/*` sale de la URL pública, y esa API solo expone la ficha y qué huecos están ocupados (nunca nombres ni teléfonos de otros clientes).

**Identidad del cliente = su teléfono** (últimos 8 dígitos). No hay cuentas de cliente. Cancelar/confirmar/declarar seña desde el chat exige el mismo teléfono con el que se reservó.

## Probar en tu compu (sin cuentas ni credenciales)

```bash
npm install
npm run dev
```

Sin `DATABASE_URL`, en desarrollo la app usa una base **Postgres embebida (PGlite)** que se guarda en `.data/` y se precarga sola con dos locales de ejemplo. Abrí http://localhost:3000.

1. **Cliente:** http://localhost:3000/t/barberia-el-faro → escribí “quiero un corte con Nico el viernes a las 5”, poné nombre y celular, confirmá.
2. **Dueño:** http://localhost:3000/login → mail `demo@webi.local`. El código de 6 números aparece en pantalla (modo desarrollo) y en la consola del servidor. Ahí ves el turno en la agenda, lo cerrás con el pago (caja), mandás el recordatorio por WhatsApp (link `wa.me`), etc.
3. Otro local de ejemplo: `/t/padel-club-sur` (dueño `padel@webi.local`, con seña obligatoria). Podés dar de alta uno nuevo en `/registro`.

Para borrar los datos locales: parar el servidor y borrar la carpeta `.data/`.

## Crear la base en Neon

1. Entrá a https://neon.tech → **New project** (región `AWS South America (São Paulo)`, la más cercana a Argentina).
2. En el dashboard → **Connection string** → activá **Pooled connection** y copiá la URL (`postgresql://...neon.tech/neondb?sslmode=require`).
3. Pegala en `.env.local` (tu archivo, no se sube a git):
   ```
   DATABASE_URL=postgresql://...
   SESSION_SECRET=<un secreto largo>
   ```
   Para generar el secreto: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. Creá las tablas y (opcional) cargá los locales de ejemplo:
   ```bash
   npm run db:migrar
   npm run db:seed
   ```

## Desplegar en Vercel

1. Subí el repo a GitHub y en Vercel → **Add New… → Project** → importalo (Framework: Next.js, sin cambiar nada).
2. En **Settings → Environment Variables** cargá: `DATABASE_URL`, `SESSION_SECRET` y `NEXT_PUBLIC_BASE_URL` (la URL pública final, ej. `https://turnos.tudominio.com`; se usa para armar el QR).
3. Antes del primer uso en producción corré `npm run db:migrar` apuntando a esa misma base (desde tu compu con el `.env.local` de producción).
4. **Dominio:** Settings → Domains → agregá el dominio/subdominio y seguí los DNS que indica Vercel.

En producción la app **exige** `DATABASE_URL` y `SESSION_SECRET` (si faltan, falla a propósito en vez de usar valores de desarrollo). Y el código de login **no** se muestra en pantalla.

## Qué incluye la Fase 1

- Multi-local real con QR por local, chat del cliente con intérprete propio, panel con agenda/caja/buscador/historial, pantalla Configurar (servicios, precios, duraciones, recursos, horarios, FAQs, logo, color).
- Login del dueño sin contraseña (código por mail).
- Recordatorios semi-automáticos: link `wa.me` de 1 toque con el mensaje armado.
- **Seña manual:** el cliente ve el alias y avisa “ya la transferí” → el local la marca como recibida.
- **Fidelidad:** contador de visitas atendidas por teléfono; el local configura premio y cada cuántas visitas; en la agenda ve cuándo hay premio para entregar. El cliente lo consulta en el chat (“Mis visitas y premio”).

## Pendientes (TODO claros)

- **Envío real del código por mail** — hoy se loguea en la consola del servidor (`enviarCodigo` en `src/server/auth.ts`). Falta conectar Resend/Postmark (`RESEND_API_KEY`, `MAIL_FROM`) y, si se quiere, un link mágico en el mismo mail.
- **OTP por WhatsApp (Fase 2):** la estructura está lista (`canal` en `codigos_login`, `usuarios.whatsapp`, `Canal` en `auth.ts`); falta la WhatsApp Business API.
- **Mercado Pago y WhatsApp Business API:** Fase 2. La seña hoy es manual.
- **Suscripción:** `locales.estado_suscripcion` existe (`prueba | activa | vencida | cancelada`); solo se bloquea el chat de los `cancelada`. Falta el cobro de los US$29/mes.
- **Límite de pedidos (rate limit)** en `/api/t/*` y `/api/registro` antes de abrir al público.
- **Reserva simultánea:** el índice único evita que dos clientes tomen el mismo horario de inicio; el solapamiento parcial lo valida el código antes de insertar. Si el volumen crece, pasar a un `EXCLUDE` por rango o a una transacción con lock por local.
- El panel carga los últimos 90 días de turnos y filtra el buscador en el navegador; paginar/buscar en el servidor cuando un local tenga mucho historial.
- Empleados (`usuarios.rol = empleado`): el modelo ya los contempla; falta la pantalla para invitarlos.
