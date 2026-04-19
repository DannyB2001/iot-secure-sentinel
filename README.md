# Iris Gateway (IoT Secure Sentinel)

Semester project for the *Internet of Things (uuklient)* course.

`Iris Gateway` is the product name; `IoT Secure Sentinel` is the internal working title and the repository name.

## What it does

Iris Gateway is a local security node for protected spaces such as server rooms, archives, and vaults. It detects physical tampering, monitors environmental conditions, and (in iteration 2) inspects local IoT network traffic. Decisions run locally on the gateway. The cloud handles visualization, configuration, and long-term audit.

## Repository layout

```
iot-secure-sentinel/
|-- docs/                  # All design and business documentation
|-- hw-node/               # HARDWARIO Core Module firmware
|-- gateway/               # Node-RED flow and helper scripts
|   |-- flows.json         # Exported Node-RED flow
|   |-- scripts/           # JS helpers
|   `-- data/              # Local config and runtime artifacts
|-- cloud-app/             # Next.js 16 cloud application (frontend + Route Handlers)
`-- README.md              # This file
```

## Documentation map

| Document                                              | Audience                            | Purpose                                                      |
| ----------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| [docs/business_requests.md](docs/business_requests.md) | product, examiners                  | actors, use cases, business requirements                     |
| [docs/architecture.md](docs/architecture.md)           | new contributors, examiners         | layers, data flows, technology stack                         |
| [docs/api_contract.md](docs/api_contract.md)           | implementers across all layers      | wire-level data formats and endpoint signatures              |
| [docs/backend_design.md](docs/backend_design.md)       | cloud team                          | Next.js Route Handlers, Mongoose schemas, validation, errors |
| [docs/frontend_design.md](docs/frontend_design.md)     | frontend team                       | Next.js App Router routes, components, state, permissions    |
| [docs/iot_design.md](docs/iot_design.md)               | firmware and gateway team           | HARDWARIO firmware modules, Node-RED flow, hardware          |
| [docs/deployment.md](docs/deployment.md)               | operators, examiners                | Raspberry Pi, Vercel, and MongoDB Atlas deployment steps     |

## Architecture in one paragraph

A HARDWARIO sensor node samples temperature and acceleration. It sends a JSON payload over radio (or USB) to a Raspberry Pi gateway running Node-RED, Mosquitto, and MongoDB. The gateway validates payloads, prioritizes alarm events, aggregates standard telemetry with a moving average, persists everything locally, and forwards aggregated records over HTTPS (HMAC + nonce signed) to a Next.js cloud app on Vercel. The cloud app uses MongoDB Atlas for persistence and pushes nothing to clients; the dashboard polls the alarm endpoint every 5 seconds. The React frontend (shadcn/ui + Tailwind v4) lets operators view dashboards, acknowledge alarms, and configure thresholds. Iteration 2 adds Suricata-based packet inspection of the IoT subnet and a firewall lockdown mechanism with a physical kill switch.

For diagrams and detailed flows, see [docs/architecture.md](docs/architecture.md).

## Technology at a glance

| Layer            | Stack                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Sensor node      | C + HARDWARIO SDK (LIS2DH12 accelerometer, TMP112 thermometer)     |
| Gateway          | Raspberry Pi 4, Node-RED, Mosquitto MQTT (auth), MongoDB           |
| IDS (iter 2)     | Suricata + iptables (default-deny FORWARD)                         |
| Cloud framework  | Next.js 16 (App Router), React 19, TypeScript                      |
| Cloud DB         | MongoDB Atlas M0 (free tier, 512 MB)                               |
| ODM + validation | Mongoose 8, Zod (shared schemas FE/BE)                             |
| Auth             | Auth.js v5 (users, Argon2id passwords); HMAC SHA-256 + UUID nonce (gateways) |
| Real-time UX     | TanStack Query polling (5 s). No SSE, no WebSocket                 |
| Background tasks | Vercel Cron Jobs (`* * * * *` to `/api/cron/tick`)                 |
| UI               | shadcn/ui, Tailwind v4, Recharts, TanStack Query + Table           |
| Hosting          | Vercel (Next.js + Cron) + MongoDB Atlas (DB). No Railway, no separate worker |
| Dev tooling      | Bun 1.2, Vitest, Playwright, Biome                                 |

## Project iterations

The project ships in two iterations with explicit MVP boundaries.

### Iteration 1: MVP

- accelerometer-based tamper detection
- temperature monitoring
- local Node-RED flow with validation, aggregation, persistence
- local MongoDB persistence (alarms, telemetry, outbox)
- cloud endpoints: `POST /api/gateway/register`, `POST /api/telemetry`, `POST /api/alarm`, `GET /api/gateway`, `GET /api/gateway/:id`, `GET /api/gateway/:id/config`, `PATCH /api/gateway/:id/config`, `GET /api/telemetry`, `GET /api/alarm`, `POST /api/alarm/:id/acknowledge`, `PATCH /api/gateway/:id/armed-state`, `POST /api/registration-token`, `GET /api/cron/tick`, `GET /api/health`
- React dashboard with KPI tiles, gateway list, alarm list, telemetry chart, polling-driven toasts on new alarms

### Iteration 2: Network IDS layer (designed, not implemented)

- Suricata IDS on the IoT subnet
- firewall lockdown via iptables (default-deny with `-I FORWARD 1` insertion)
- physical kill switch on GPIO 17
- bidirectional cloud ↔ gateway configuration push
- cloud endpoints: `POST /api/security-event`, `POST /api/firewall/rule`

The repository code currently delivers iteration 1 (firmware skeleton and Node-RED flow are present; cloud app is to be implemented per the design docs). Iteration 2 is fully specified in the design documents.

## Component status

| Component                    | State                                                      |
| ---------------------------- | ---------------------------------------------------------- |
| Documentation                | complete (this iteration)                                  |
| Node firmware (`hw-node`)    | skeleton in `main.c`, needs HARDWARIO SDK wiring (I-M1)    |
| Node-RED flow (`gateway`)    | working flow with demo inject, validation, alarm branch, moving avg, local Mongo, MQTT publish; cloud HTTP forwarder is the planned extension (I-M4) |
| Cloud app (`cloud-app`)      | placeholder, implementation per `docs/backend_design.md` and `docs/frontend_design.md` |

## Wire format (node → gateway)

```json
{
  "deviceId": "node-01",
  "timestamp": "2026-04-19T08:30:00Z",
  "temperatureC": 24.7,
  "accelG": 0.18,
  "alarm": false,
  "batteryVoltage": 2.95,
  "transport": "radio"
}
```

`deviceId` here is the **sensor node** identifier (e.g. `node-01`), not the gateway hardware id. Field semantics, validation rules, and gateway → cloud transformations are in [docs/api_contract.md](docs/api_contract.md).

## Quick start

### Cloud app (local development)

```bash
cd cloud-app
bun install
cp .env.example .env.local
docker compose up -d              # local MongoDB
bun run db:seed
bun dev                           # http://localhost:3000
```

### Gateway

Detailed steps live in [docs/deployment.md](docs/deployment.md). Minimum to run the included Node-RED flow locally:

```bash
# prerequisites: Node.js 22+, MongoDB on 27017, Mosquitto on 1883
sudo npm install -g --unsafe-perm node-red
node-red
```

In the Node-RED editor:

1. `Menu → Import` → paste the contents of `gateway/flows.json`
2. Adjust the input node (serial / MQTT) to match your hardware
3. Configure the MongoDB and MQTT connection nodes for your environment
4. Set the cloud forwarder base URL to your local Next.js (`http://host.docker.internal:3000`) or your deployed Vercel URL
5. Deploy

## Hardware bill of materials

- HARDWARIO Core Module
- HARDWARIO Radio Module (or USB CDC for wired bring-up)
- LIS2DH12 accelerometer
- TMP112 temperature sensor (or onboard MCU sensor)
- 3× AAA alkaline or LiPo battery
- Raspberry Pi 4 (2 GB RAM minimum)
- HARDWARIO USB Radio Gateway stick
- Iteration 2: USB Ethernet adapter, momentary push button, RGB LED

## Next steps

- wire the firmware skeleton to real HARDWARIO SDK calls (sensors, radio, sleep)
- extend the Node-RED flow with HMAC-signed cloud HTTP forwarders, the outbox pattern, and the armed-state gate
- bootstrap the Next.js project under `cloud-app/` and implement milestone M1 endpoints (`/api/gateway/register`, `/api/telemetry`, `/api/alarm`)
- bootstrap the dashboard under `cloud-app/src/app/(dashboard)/` and implement milestone F-M1 routes
- set up CI to lint Node-RED JSON, validate Zod schemas, run Vitest, run Playwright
