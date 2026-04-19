# Architecture

## Purpose

This document gives the system-level view of Iris Gateway: layers, data flow, technology stack, and cross-cutting concerns. It is the entry point for new contributors. Detail lives in `iot_design.md`, `backend_design.md`, `frontend_design.md`, and `api_contract.md`.

## Layered view

```
+---------------------------------------------------------------+
|  Presentation                                                 |
|  Next.js 16 App Router (Server + Client Components)           |
|  - dashboard, gateway detail, alarms, settings                |
|  - shadcn/ui + Tailwind v4 + Recharts + TanStack Query        |
|  - 5-second polling for real-time UX (no SSE)                 |
+------------------+--------------------------------------------+
                   |  fetch (same origin)
                   v
+---------------------------------------------------------------+
|  Cloud backend                                                |
|  Next.js Route Handlers (/app/api/**/route.ts)                |
|  - Zod validation                                             |
|  - Auth.js sessions for users, HMAC + nonce for gateways      |
|  - Service layer (Mongoose)                                   |
|  - AuditLog writes for sensitive mutations                    |
+------------------+--------------------------------------------+
                   |  Mongoose 8
                   v
+---------------------------------------------------------------+
|  MongoDB Atlas (M0 free tier)                                 |
|  - collections: gateway, telemetry (TTL 30 d), alarm,         |
|    securityEvent (TTL 90 d), firewallRule, user,              |
|    registrationToken (TTL), auditLog (TTL 1 y)                |
+------------------+--------------------------------------------+
                   ^
                   | HTTPS + HMAC + nonce
                   |
+---------------------------------------------------------------+
|  Edge gateway                                                 |
|  Raspberry Pi 4 + Node-RED                                    |
|  - payload validation                                         |
|  - alarm priority branch                                      |
|  - moving-average aggregation                                 |
|  - local MongoDB (telemetry, alarm, outbox)                   |
|  - cloud forwarder with outbox retry                          |
|  - iteration 2: Suricata IDS + iptables                       |
+------------------+--------------------------------------------+
                   |  radio (868 MHz) or USB CDC
                   v
+---------------------------------------------------------------+
|  Sensor node                                                  |
|  HARDWARIO Core Module                                        |
|  - LIS2DH12 accelerometer (interrupt-driven)                  |
|  - TMP112 temperature sensor                                  |
|  - JSON payload producer                                      |
+---------------------------------------------------------------+
```

## Physical topology

```
                    +-------------------+
                    |  Iris Cloud App   |
                    |   (Vercel)        |
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
|               |     Raspberry Pi Gateway     |            |
|               |  Node-RED | MongoDB | MQTT   |            |
|               |  Suricata (iter 2)           |            |
|               +------+------------+-----+----+            |
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
| Radio            | HARDWARIO Radio (868 MHz, proprietary)                           |
| Gateway OS       | Raspberry Pi OS (64-bit Bookworm)                                |
| Gateway runtime  | Node-RED on Node.js 22                                           |
| Gateway broker   | Mosquitto (local MQTT, auth required)                            |
| Gateway storage  | MongoDB 7.x (local)                                              |
| IDS (iter 2)     | Suricata 7.x in IDS mode (af-packet)                             |
| Firewall (iter 2)| iptables, default-deny FORWARD with explicit allow-list          |
| Cloud framework  | Next.js 16 (App Router) on Node.js 22                            |
| Cloud DB         | MongoDB Atlas M0 (free tier, 512 MB)                             |
| ODM              | Mongoose 8                                                       |
| Validation       | Zod (shared between server and client)                           |
| Auth             | Auth.js v5 for users (Argon2id passwords); HMAC SHA-256 + UUID nonce for gateways |
| Real-time UX     | TanStack Query polling (5 s interval). No SSE, no WebSocket      |
| Background tasks | Vercel Cron Jobs (`* * * * *` to `/api/cron/tick`)               |
| UI primitives    | shadcn/ui (vendored) on Tailwind CSS v4                          |
| Server state     | TanStack Query v5 (client) + Server Components (server)          |
| Charts           | Recharts 3                                                       |
| Tables           | TanStack Table v8                                                |
| Forms            | React Hook Form + `@hookform/resolvers/zod`                      |
| Icons            | Lucide React                                                     |
| Runtime tooling  | Bun 1.2 (dev), Vitest, Biome (lint + format), Playwright         |
| Container        | Docker Compose for local Mongo only                              |
| Cloud hosting    | Vercel (Next.js + Cron) + MongoDB Atlas (DB); see `deployment.md`|

Single-platform deploy. No Railway, no separate worker process, no streaming infrastructure.

## Data flow: standard telemetry

```
Node                 Gateway (Node-RED)              Cloud (Next.js)         Frontend
  |                          |                            |                      |
  | JSON over radio (60 s)   |                            |                      |
  |------------------------->|                            |                      |
  |                          | validate                   |                      |
  |                          | moving average             |                      |
  |                          | persist to local Mongo     |                      |
  |                          | POST /api/telemetry        |                      |
  |                          | (HMAC + nonce headers)     |                      |
  |                          |--------------------------->|                      |
  |                          |                            | HMAC verify          |
  |                          |                            | nonce check          |
  |                          |                            | Zod validate         |
  |                          |                            | Mongoose insert      |
  |                          |                            | (idempotent on key)  |
  |                          |                            | UPDATE gateway.lastSeenAt
  |                          |    201 { id }              |                      |
  |                          |<---------------------------|                      |
  |                          |                            |                      |
  |                          |                            |  GET /api/telemetry  |
  |                          |                            |<---------------------|
  |                          |                            |  Mongo query         |
  |                          |                            |  (raw < 24h, $bucket |
  |                          |                            |   aggregation ≥ 24h) |
  |                          |                            |--------------------->|
```

## Data flow: alarm with polling

```
Node            Gateway                   Cloud                     Frontend (polling 5 s)
  | accel ≥ 1.20 g    |                       |                            |
  | alarm payload     |                       |                            |
  |------------------>|                       |                            |
  |                   | check armedState      |                            |
  |                   | armed? yes →          |                            |
  |                   | persist to local Mongo|                            |
  |                   | POST /api/alarm       |                            |
  |                   | (HMAC + nonce)        |                            |
  |                   |---------------------->|                            |
  |                   |                       | Zod + HMAC verify          |
  |                   |                       | Mongoose insert (idempotent)
  |                   |                       | AuditLog write             |
  |                   |   201 { id, ... }     |                            |
  |                   |<----------------------|                            |
  |                                                                        |
  |                                                                        | next poll
  |                                                                        | (≤ 5 s after insert)
  |                                                                        | GET /api/alarm?state=unresolved
  |                                                                        |<--------- (cloud)
  |                                                                        | items[0].id changed
  |                                                                        | toast + KPI update
```

End-to-end target latency: under 5 s 95th percentile, under 10 s worst case.

## Data flow: arming from the dashboard

```
Operator → Frontend                 Cloud                          Gateway
  |             |                      |                              |
  | toggle armed                       |                              |
  |             | PATCH /api/gateway/:id/armed-state                 |
  |             |--------------------->|                              |
  |             |                      | session + role check         |
  |             |                      | Mongoose update              |
  |             |                      | bump configVersion           |
  |             |                      | AuditLog write               |
  |             |    200 { armedState }|                              |
  |             |<---------------------|                              |
  |                                                                   |
  |                              (gateway poll cycle, every 5 min)    |
  |                                                                   |
  |             |                      | GET /api/gateway/:id/config  |
  |             |                      |<-----------------------------|
  |             |                      | { armedState: 'disarmed' }   |
  |             |                      |----------------------------->|
  |             |                      |                              | apply in flow
```

## Data flow: IDS event and lockdown (iteration 2)

```
IoT device traffic    Suricata          Node-RED                          Cloud
    |                   |                  |                                |
    | outbound packet   |                  |                                |
    |------------------>| signature hit    |                                |
    |                   | event → eve.json |                                |
    |                   |----------------->|                                |
    |                   |                  | parse, match local rule        |
    |                   |                  | iptables -I FORWARD 1 ...      |
    |                   |                  | (insert at top, ahead of allow)|
    |                   |                  | POST /api/security-event       |
    |                   |                  |------------------------------->|
    |                   |                  |                                | persist
    |                   |                  | POST /api/firewall/rule        |
    |                   |                  |------------------------------->|
    |                   |                  |                                | persist (audit)
```

## Cross-cutting concerns

### Resilience

- Gateway buffers cloud requests in Mongo `outbox` when the cloud is unreachable
- Retry with exponential backoff (15 s → 30 s → 60 s → 5 min cap), max age 24 h
- Node alarm cooldown (5 s) prevents flooding
- Mongo TTL keeps both gateway-local and cloud collections bounded
- Idempotency keys on telemetry/alarm POSTs make retries safe (no duplicates)
- Polling is naturally resilient: a transient failure just delays one tick

### Security

- Gateway ↔ cloud: HMAC SHA-256 with single-use UUID nonce (10-minute window). Secret hashed at rest (SHA-256, constant-time compare)
- Frontend ↔ cloud: Auth.js session in HTTP-only cookie, role-based authorization at the Route Handler
- User passwords: Argon2id (OWASP 2026 baseline)
- IoT subnet segregation: gateway has two NICs; the IoT subnet has no direct internet path
- iptables FORWARD policy is **default-deny**; explicit allow-list for required egress (DNS, NTP, vendor cloud); IDS / kill-switch rules use `-I FORWARD 1` to insert ahead of the allow-list
- Mosquitto requires authentication (`mosquitto_passwd`) and ACL restricts the `iot-secure-sentinel/firewall` topic to two publishers (rule engine, kill-switch service)
- Kill switch GPIO debounced and requires a 2-second hold; falls back to direct iptables call if MQTT publish fails
- Radio link uses HARDWARIO defaults in MVP; per-node HMAC + monotonic counter is the planned mitigation for iteration 2 (open in `iot_design.md`)
- Database credentials in environment variables, never in code; Mongoose query logging is dev-only

### Observability

- Structured JSON logs (`pino`) on the cloud backend, picked up by Vercel log drains
- Per-request `traceId` (UUID) propagated through service calls
- Slow Mongo query log threshold 200 ms (dev only)
- `GET /api/health` returns `{ status, db, version }` for external uptime monitoring
- Node-RED debug nodes emit to sidebar and optionally to file
- Internal MQTT topics on the gateway expose flow state for local dashboards
- AuditLog collection records who/when/what for config changes, armed-state changes, alarm acknowledgements, registration token issuance, role changes

### Configuration

- Compile-time on the node (intervals, thresholds); rebuild required for change
- Runtime in `gateway.config` document, pulled by the gateway via `GET /api/gateway/:id/config` every 5 minutes
- Frontend reads runtime values from the backend; no client-side overrides
- Env vars on the cloud: `MONGODB_URI`, `AUTH_SECRET`, `AUTH_URL`, `CRON_SECRET`, `NODE_ENV`

## Deployment model

MVP targets a single tenant per deployment. Each deployment may hold multiple gateways under one organization.

Hosting:
- **Frontend + backend (Next.js):** Vercel (auto build from git, preview deployments per PR, free Hobby tier)
- **Database:** MongoDB Atlas M0 cluster (free tier, 512 MB, no time limit)
- **Background tasks:** Vercel Cron Jobs (free on Hobby, minute-resolution)

No Railway, no Docker images for the cloud app, no separate worker process. `git push` triggers full deploy.

Scaling plan (out of scope for MVP):
- Atlas M10 paid tier when storage exceeds 512 MB
- Atlas dedicated cluster for production-grade performance and snapshots
- Migrate background tasks to a dedicated worker (Vercel Functions Long-Running, Inngest, or a small VPS)
- Add Redis for shared nonce cache when running multiple Vercel regions

## Technology choices: why

| Choice                      | Reason                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------- |
| HARDWARIO                   | course platform with a radio stack, low power, C SDK with accelerometer support         |
| Node-RED at the edge        | fast to build the flow, visual debugging, ready-to-use Mongo and MQTT nodes             |
| MongoDB on the gateway      | document model fits the buffered outbox pattern; runs comfortably on Pi                 |
| Next.js App Router          | one repo, one deploy, Server Components for cheap initial render, file-based routing    |
| MongoDB Atlas in the cloud  | same data model end-to-end (gateway and cloud), free tier, zero infrastructure setup    |
| Mongoose                    | type-safe schemas, middleware, virtuals; less ceremony than raw driver                  |
| Zod                         | schemas live in `src/lib/validation` and are imported by Route Handlers and forms       |
| Auth.js v5                  | session in HTTP-only cookie, credentials provider for email/password, easy to extend    |
| HMAC + nonce for gateway    | simple, no PKI, stateless verification, replay protection in 10-minute window           |
| Polling over SSE            | meets NFR5 (5 s) without long-lived connections; works on Vercel Hobby; simpler to operate and debug |
| shadcn/ui + Tailwind v4     | own the component code, change tokens in `globals.css`, no opinionated theme to fight   |
| Recharts                    | declarative React charts, fits Server/Client boundary cleanly                            |
| TanStack Query              | great DX for server state, integrates with Server Component initial data, drives polling cleanly |
| Bun in development          | 5–10× faster install than npm, drop-in package manager, native TypeScript                |
| Vercel + MongoDB Atlas      | both free tier, both deploy in minutes, single-platform CI/CD                            |

## Known limitations

- Node has no RTC in MVP; timestamps can drift up to 5 minutes before the gateway re-stamps
- Cloud outage longer than 24 h exceeds gateway outbox retention, leading to data loss
- Radio MTU caps payload at 256 bytes; new fields must respect this budget
- Suricata on a Raspberry Pi 4 handles around 50 Mbps sustained; high-traffic subnets need a stronger host
- Atlas M0 has 512 MB storage and 100 max connections; sufficient for a school project but not production scale
- HMAC nonce cache is in-memory per Vercel function instance; multi-region deployments need Redis (out of scope)
- Polling has 0–5 s alarm visibility latency. Suitable for the MVP SLO; sub-second push would require dedicated streaming infrastructure
