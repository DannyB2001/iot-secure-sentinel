# Architecture

## Purpose

System-level view of Iris Gateway: layers, data flow, technology stack, and cross-cutting concerns. Entry point for new contributors. Detail lives in `iot_design.md`, `backend_design.md`, `frontend_design.md`, and `api_contract.md`.

## Layered view

```
+---------------------------------------------------------------+
|  Presentation                                                 |
|  Next.js 16 App Router (Server + Client Components)           |
|  - /dashboard, /devices, /events, /alarms, /status            |
|  - shadcn/ui + Tailwind v4 + Recharts + TanStack Query        |
|  - 5-second polling for real-time UX (no SSE)                 |
+------------------+--------------------------------------------+
                   |  fetch (same origin) + session cookie
                   v
+---------------------------------------------------------------+
|  Cloud backend                                                |
|  Next.js Route Handlers (/app/api/<command>/route.ts)         |
|  - Zod validation (with `unsupportedKeys` warning)            |
|  - Auth.js v5 sessions (ADMIN/OPERATOR/USER)                  |
|  - Bearer token auth (DEVICE role)                            |
|  - Service layer (Mongoose)                                   |
|  - AuditLog writes for sensitive mutations                    |
+------------------+--------------------------------------------+
                   |  Mongoose 8
                   v
+---------------------------------------------------------------+
|  MongoDB Atlas (M0 free tier)                                 |
|  collections:                                                 |
|  - devices                                                    |
|  - sensors                                                    |
|  - events  (TTL 90 d)                                         |
|  - alarms                                                     |
|  - users                                                      |
|  - registrationTokens (TTL)                                   |
|  - auditLog (TTL 1 y)                                         |
+------------------+--------------------------------------------+
                   ^
                   | HTTPS + Bearer token
                   |
+---------------------------------------------------------------+
|  Edge gateway (Raspberry Pi 4)                                |
|  - Node-RED flow                                              |
|  - Mosquitto MQTT (auth + ACL)                                |
|  - local MongoDB (telemetry, alarm, outbox)                   |
|  - cloud forwarder → device/heartbeat, event/create           |
|  - iter 2: Suricata IDS + iptables default-deny               |
+------------------+--------------------------------------------+
                   |  radio (868 MHz) or USB CDC
                   v
+---------------------------------------------------------------+
|  Sensor node (HARDWARIO Core Module)                          |
|  - LIS2DH12 accelerometer                                     |
|  - TMP112 temperature sensor                                  |
|  - iter 2: PIR, magnetic contact, smoke                       |
|  - JSON payload producer                                      |
+---------------------------------------------------------------+
```

## Physical topology

```
                    +-------------------+
                    |  Iris Web App +   |
                    |  Backend (Vercel) |
                    +---------+---------+
                              |
                              v
                    +-------------------+
                    |  MongoDB Atlas    |
                    |   (M0 cluster)    |
                    +-------------------+
                              ^
                              | HTTPS (Atlas connection string)
                              |
+-----------------------------+-----------------------------+
|                                                           |
|               +-----------------------------+             |
|               |    Raspberry Pi Gateway     |             |
|               |  Node-RED | MongoDB | MQTT  |             |
|               |  Suricata (iter 2)          |             |
|               +------+------------+-----+---+             |
|                      |            |     |                 |
|              radio/USB     IoT subnet   GPIO              |
|                      |            |     |                 |
|       +--------------+   +--------+--+   +---+            |
|       | HARDWARIO     |  | IoT device |  | Kill |         |
|       | sensor node   |  | IoT device |  | Switch |       |
|       +---------------+  | ...        |  +---------+      |
|                          +------------+                   |
|                    Protected space                        |
+-----------------------------------------------------------+
```

## Technology stack

| Layer            | Technology                                                       |
| ---------------- | ---------------------------------------------------------------- |
| Sensor node      | HARDWARIO Core Module, C + HARDWARIO SDK                         |
| Sensors (iter 1) | LIS2DH12 accelerometer, TMP112 temperature                       |
| Sensors (iter 2) | PIR motion, magnetic contact, smoke                              |
| Radio            | HARDWARIO Radio (868 MHz, proprietary)                           |
| Gateway OS       | Raspberry Pi OS (64-bit Bookworm)                                |
| Gateway runtime  | Node-RED on Node.js 22                                           |
| Gateway broker   | Mosquitto (local MQTT, auth + ACL required)                      |
| Gateway storage  | MongoDB 7 (local)                                                |
| IDS (iter 2)     | Suricata 7 in IDS mode (af-packet)                               |
| Firewall (iter 2)| iptables, default-deny FORWARD                                   |
| Cloud framework  | Next.js 16 (App Router) on Node.js 22                            |
| Cloud DB         | MongoDB Atlas M0 (free tier, 512 MB)                             |
| ODM              | Mongoose 8                                                       |
| Validation       | Zod (shared schemas FE/BE)                                       |
| User auth        | Auth.js v5, Argon2id passwords                                   |
| Device auth      | Bearer token (`dt_<32 hex>`), SHA-256 hashed at rest, timingSafeEqual compare |
| Real-time UX     | TanStack Query polling (5 s). No SSE, no WebSocket               |
| Background tasks | Vercel Cron Jobs (`* * * * *` to `/api/cron/tick`)               |
| UI primitives    | shadcn/ui on Tailwind CSS v4                                     |
| Server state     | TanStack Query v5 + Server Components                            |
| Charts           | Recharts 3                                                       |
| Tables           | TanStack Table v8                                                |
| Forms            | React Hook Form + `@hookform/resolvers/zod`                      |
| Icons            | Lucide React                                                     |
| Dev tooling      | Bun 1.2, Vitest, Biome, Playwright                               |
| Container        | Docker Compose for local Mongo                                   |
| Cloud hosting    | Vercel (Next.js + Cron) + MongoDB Atlas (DB); see `deployment.md` |

Single-platform deploy. No Railway, no separate worker process, no streaming infrastructure.

## Entity model (Mongoose collections)

```
device (1) ─────────< sensor (N)
   │                     │
   │                     │
   └────< event (N) >────┘
               │
               │ optional 1:1
               v
            alarm (0..1 per event)

user (independent; role = ADMIN | OPERATOR | USER)
registrationToken (short-lived, consumed at device/register)
auditLog (append-only; TTL 1 y)
```

A Device has many Sensors. Each Sensor can generate many Events. An Event may produce an Alarm if rules fire. Alarms are acknowledged by Users.

## Data flow: device heartbeat

```
Device              Cloud (Next.js Route Handler)        MongoDB
  |                       |                                 |
  | POST /api/device/heartbeat                              |
  | Authorization: Bearer dt_...                            |
  |---------------------->|                                 |
  |                       | bearer token lookup             |
  |                       | timingSafeEqual on hash         |
  |                       |-------------------------------->|
  |                       |   device doc                    |
  |                       |<--------------------------------|
  |                       | update lastSeen, status         |
  |                       |-------------------------------->|
  |  200 { lastSeen }     |                                 |
  |<----------------------|                                 |
```

## Data flow: event with alarm

```
Node           Gateway (Node-RED)        Cloud                        Frontend (poll 5 s)
  | accel ≥ 1.20 g   |                      |                             |
  | payload (radio)  |                      |                             |
  |----------------->|                      |                             |
  |                  | persist to local     |                             |
  |                  | resolve sensor       |                             |
  |                  | POST /api/event/create                             |
  |                  | Authorization: Bearer dt_...                       |
  |                  |--------------------->|                             |
  |                  |                      | Zod + bearer token verify   |
  |                  |                      | compute idempotency key     |
  |                  |                      | insert event                |
  |                  |                      | alarm rules → create alarm  |
  |                  |                      | AuditLog                    |
  |                  |  201 { alarmId }     |                             |
  |                  |<---------------------|                             |
  |                                                                       |
  |                                                                       | next poll (≤ 5 s)
  |                                                                       | GET /api/alarm/list?status=active
  |                                                                       |<----- (cloud)
  |                                                                       | new id detected
  |                                                                       | toast + KPI update
```

End-to-end latency target: under 5 s 95th percentile, under 10 s worst case.

## Data flow: alarm acknowledge

```
Operator → Frontend                 Cloud                          MongoDB
  |             |                      |                              |
  | click       |                      |                              |
  |             | POST /api/alarm/acknowledge                       |
  |             | session cookie       |                              |
  |             |--------------------->|                              |
  |             |                      | session verify, role check   |
  |             |                      | Mongoose update              |
  |             |                      |----------------------------->|
  |             |                      | AuditLog write               |
  |             |                      |----------------------------->|
  |             |   200 { ack'd }      |                              |
  |             |<---------------------|                              |
```

## Data flow: network anomaly (iter 2)

```
IoT device traffic    Suricata          Node-RED                      Cloud
    |                   |                  |                            |
    | outbound packet   | signature hit    |                            |
    |                   | event → eve.json |                            |
    |                   |----------------->|                            |
    |                   |                  | parse, map to Sensor       |
    |                   |                  | POST /api/event/create     |
    |                   |                  |   eventType=networkAnomaly |
    |                   |                  |--------------------------->|
    |                   |                  |                            | persist + alarm rule
    |                   |                  | local iptables -I FORWARD  |
    |                   |                  | POST /api/firewall/applyRule                
    |                   |                  |--------------------------->|
    |                   |                  |                            | persist (audit)
```

## Cross-cutting concerns

### Resilience

- Gateway buffers cloud requests in local Mongo `outbox` when the cloud is unreachable
- Retry with exponential backoff (15 s → 30 s → 60 s → 5 min cap), max age 24 h
- Idempotency keys on `event/create` prevent duplicates on retry (`sha256(deviceId|sensorId|timestamp|value|message)`)
- Polling on the frontend is naturally resilient — a transient failure delays one tick
- Vercel Cron tick marks stale devices offline (`lastSeen` older than 3 × heartbeat interval)

### Security

- Users: Auth.js v5 session cookie, Argon2id passwords (OWASP 2026 baseline)
- Devices: Bearer token issued once at `device/register`, stored SHA-256 hashed, constant-time compare
- IoT subnet segregation: gateway has two NICs; IoT subnet has no direct internet path
- iptables FORWARD policy is default-deny with explicit allow-list (DNS, NTP, per-device); IDS / kill switch use `-I FORWARD 1` to insert ahead
- Mosquitto requires authentication and ACL restricts `iot-secure-sentinel/firewall` to two publishers
- Kill switch GPIO debounced (2-second hold); MQTT fallback to direct iptables if broker down
- Radio link uses HARDWARIO defaults in MVP; per-node signing is the planned mitigation for iteration 2
- Database credentials in env vars; Mongoose connection error logging sanitized

### Observability

- Structured JSON logs (`pino`) on the backend, picked up by Vercel log drains
- Per-request `traceId` (UUID)
- `GET /api/health` for external uptime monitoring
- `AuditLog` records sensitive mutations (alarm acknowledge, config change, role change, token issuance)
- Node-RED debug nodes emit to sidebar

### Configuration

- Compile-time on the node (`DEVICE_ID`, `ALARM_THRESHOLD_G`, telemetry interval); rebuild required for change
- Runtime on the gateway: `/etc/iris-gateway/credentials.json` holds `deviceId`, `apiToken`, `baseUrl`
- Env vars on the cloud: `MONGODB_URI`, `AUTH_SECRET`, `AUTH_URL`, `CRON_SECRET`, `NODE_ENV`

## Deployment model

MVP targets a single tenant per deployment.

Hosting:
- **Frontend + backend (Next.js):** Vercel, auto build from git, preview deployments per PR, free Hobby tier
- **Database:** MongoDB Atlas M0 cluster (free tier, 512 MB, no time limit)
- **Background tasks:** Vercel Cron Jobs

No Railway, no separate worker, no streaming infrastructure. `git push` triggers full deploy.

Scaling plan (out of scope for MVP):
- Atlas M10 when storage exceeds 512 MB
- Add Redis for shared rate-limit / login-attempts cache when running multiple Vercel regions
- Migrate heavy background jobs to a dedicated worker

## Technology choices: why

| Choice                      | Reason                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------- |
| HARDWARIO                   | course platform, radio stack, low power, C SDK with accelerometer support               |
| Node-RED at the edge        | fast to build, visual debugging, ready-to-use Mongo and MQTT nodes                      |
| MongoDB on the gateway      | document model fits the buffered outbox pattern; runs comfortably on Pi                 |
| Next.js App Router          | one repo, one deploy, Server Components, file-based routing                             |
| MongoDB Atlas in the cloud  | same data model end-to-end, free tier, zero infrastructure setup                        |
| Mongoose                    | type-safe schemas, middleware, less ceremony than raw driver                            |
| Zod                         | schemas live in `src/lib/validation/` and are imported by Route Handlers and forms alike |
| Auth.js v5                  | session in HTTP-only cookie, credentials provider, easy to extend                       |
| Bearer token for devices    | matches uuApp DEVICE role pattern; simpler than HMAC + nonce; no replay risk if tokens are rotated on compromise |
| Polling over SSE            | meets NFR5 (5 s) without long-lived connections; works on Vercel Hobby; simpler to operate |
| shadcn/ui + Tailwind v4     | own the component code, no opinionated theme                                            |
| Recharts                    | declarative React charts, fits Server/Client boundary cleanly                           |
| TanStack Query              | great DX for server state, drives polling cleanly                                       |
| Vercel + MongoDB Atlas      | both free tier, both deploy in minutes, single-platform CI/CD                           |

## Known limitations

- Node has no RTC in MVP; timestamps can drift up to 5 minutes before the gateway re-stamps
- Cloud outage longer than 24 h exceeds gateway outbox retention
- Radio MTU caps payload at 256 bytes
- Suricata on Raspberry Pi 4 handles ~50 Mbps sustained
- Atlas M0 has 512 MB storage and 100 max connections
- Bearer tokens do not expire automatically; rotation requires re-registration (documented on the device)
- Polling has 0–5 s alarm visibility latency; sub-second push would require dedicated streaming infrastructure
