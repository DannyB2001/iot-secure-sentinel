# cloud-app

Next.js cloud application for Iris Gateway. Holds both the React frontend and the REST API (Route Handlers under `src/app/api/`). Endpoint paths follow the team's uuApp command names (e.g. `event/create` -> `POST /api/event/create`).

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript 5
- MongoDB via `mongodb-memory-server` for local dev (zero infra). MongoDB Atlas planned for production
- Mongoose 8 for models
- Auth.js v5 (Credentials provider, Argon2id at OWASP recommended cost) for users (`ADMIN | OPERATOR | USER`)
- Bearer token authentication for the `DEVICE` role (per-device API token, SHA-256 hashed at rest)
- Zod for input validation (shared schemas with the frontend)
- Tailwind CSS v3 + small shadcn-style component layer
- TanStack Query v5 (5 s polling for real-time UX, no SSE)
- Vitest for unit tests (46 tests covering classifier, validators, error envelope, idempotency, password hashing)

## Local development

```bash
cd cloud-app
bun install
cp .env.example .env.local            # generate AUTH_SECRET, see below
bun dev                               # http://localhost:3000
```

`AUTH_SECRET` must be at least 32 random bytes:

```bash
openssl rand -base64 32
```

On first request the app boots an in-memory MongoDB and seeds:

- admin user `admin@iris.local` / `admin123` (override via `SEED_ADMIN_*`)
- a mock gateway device `mock-gateway-01` with token `mock-token-please-rotate` (override via `SEED_DEVICE_*`)

In-memory data is wiped on every restart. Switch to MongoDB Atlas later by replacing the connection logic in `src/lib/db.ts`. Production seeding refuses to run with default credentials (must set `SEED_ADMIN_PASSWORD` and `SEED_DEVICE_TOKEN` to non-default values).

### Tests

```bash
bun run test          # one-shot vitest run
bun run test:watch    # watch mode
```

### Build

```bash
bun run build         # next build (must succeed before commit)
```

## Demo without hardware

Open two terminals.

Terminal 1: `bun dev`. Sign in at `http://localhost:3000/login` with the admin credentials.

Terminal 2:

```bash
bun run mock-device
```

The mock device script POSTs a scenario (temperature normal -> tamper -> temperature critical -> battery critical -> heartbeat) on a loop. Watch `/dashboard` and `/alarms` update via 5-second polling. SIGINT (Ctrl+C) exits cleanly between iterations.

## Project layout

```
src/
  app/
    api/
      auth/[...nextauth]/route.ts
      event/create/route.ts
      device/list/route.ts
      alarm/list/route.ts
      alarm/acknowledge/route.ts
    (dashboard)/
      layout.tsx           # server-side auth guard + nav + sign-out action
      dashboard/page.tsx   # device + alarm + event-24h counts
      devices/page.tsx
      alarms/page.tsx
    login/page.tsx         # client component, useSearchParams in Suspense
    layout.tsx
    page.tsx               # redirects to /dashboard
    globals.css
  components/
    AlarmTable.tsx         # 5s polling + acknowledge mutation
    DeviceTable.tsx        # 10s polling
    providers.tsx          # SessionProvider + QueryClientProvider
    ui/                    # button, card, input, badge
  lib/
    auth.ts                # Auth.js v5 config (handlers, auth, signIn, signOut)
    db.ts                  # mongodb-memory-server boot + auto-seed (with promise reset on error)
    device-auth.ts         # bearer token -> Device lookup
    error-envelope.ts      # uuAppErrorMap helpers, fromZod with errorCode tagging
    idempotency.ts         # eventIdempotencyKey (NUL-sentinel for missing fields)
    origin-guard.ts        # same-origin check for cookie-auth POSTs
    password.ts            # Argon2id (memoryCost 47104) + sha256 device tokens
    seed.ts                # admin user + mock gateway (production guarded)
    validation/
      event.ts             # eventCreateSchema with timestampInFuture refine
      alarm.ts             # acknowledge + list query schemas
  middleware.ts            # protects /dashboard, /devices, /alarms via getToken
  models/
    User.ts
    Device.ts
    Event.ts
    Alarm.ts
  services/
    alarm-classifier.ts    # threshold-based: tamper -> critical, temp/battery rules
  types/
    next-auth.d.ts         # AppRole literal union
scripts/
  mock-device.ts
```

## Endpoints

| Command            | Method | Path                                       | Auth                |
|--------------------|--------|--------------------------------------------|---------------------|
| `event/create`     | POST   | `/api/event/create`                        | Bearer device token |
| `device/list`      | GET    | `/api/device/list`                         | Session             |
| `alarm/list`       | GET    | `/api/alarm/list?state=open&limit=100`     | Session             |
| `alarm/acknowledge`| POST   | `/api/alarm/acknowledge`                   | Session (OPERATOR+) + same-origin |

Errors follow uuApp shape: `{ "uuAppErrorMap": { "<code>": { "type": "error", "message": "..." } } }`.

Common error codes: `invalidDtoIn`, `timestampInFuture`, `invalidAlarmState`, `unauthorized`, `forbidden`, `deviceNotFound`, `alarmNotFound`. Full list in [docs/api_contract.md](../docs/api_contract.md) section 8.

## Implementation status

MVP for iteration 1 (tamper + temperature). Full command surface from [docs/backend_design.md](../docs/backend_design.md) "Implementation status" section is the iteration 2 plan.

## Known limitations (out of scope for the MVP)

- **Single Next.js dev worker assumption**: `globalThis.__irisDb` caches the in-memory MongoDB per worker. If `next dev` ever spawns multiple workers, data will look inconsistent across pages. Pin `--turbo=false` if it bites; the prod path uses MongoDB Atlas where the cache is irrelevant.
- **No rate limiting on `/api/auth/*` or `/api/event/create`**. Argon2id naturally throttles login brute-force; production deploy should add a rate limiter.
- **No CSP / HSTS headers**. Acceptable for localhost MVP, add a `headers()` block in `next.config.mjs` before deploying.
- **Async unique index on `idempotencyKey`**: under concurrent first inserts the index may not be built yet. Single mock device at 8 s cadence cannot trigger this.
