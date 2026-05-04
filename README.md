# Iris Gateway (IoT Secure Sentinel)

Semester project for the *Internet of Things (uuklient)* course.

`Iris Gateway` is the product name; `IoT Secure Sentinel` is the internal working title and the repository name.

## What it does

Iris Gateway is an IoT security system for protected spaces. Distributed sensors on a HARDWARIO IoT node detect tamper, motion, door/window opening, smoke, and temperature. A Raspberry Pi gateway aggregates events and forwards them to a Next.js cloud backend. Operators view the current state, browse event history, and acknowledge alarms through a web dashboard.

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
| [docs/business_requests.md](docs/business_requests.md) | product, examiners                  | actors, role profiles, use cases, business requirements      |
| [docs/architecture.md](docs/architecture.md)           | new contributors, examiners         | layers, data flows, technology stack                         |
| [docs/api_contract.md](docs/api_contract.md)           | implementers across all layers      | wire-level data formats and endpoint signatures              |
| [docs/backend_design.md](docs/backend_design.md)       | cloud team                          | Next.js Route Handlers, Mongoose schemas, validation, errors |
| [docs/frontend_design.md](docs/frontend_design.md)     | frontend team                       | Next.js App Router routes, components, state, permissions    |
| [docs/iot_design.md](docs/iot_design.md)               | firmware and gateway team           | HARDWARIO firmware modules, Node-RED flow, hardware          |
| [docs/deployment.md](docs/deployment.md)               | operators, examiners                | Raspberry Pi, Vercel, and MongoDB Atlas deployment steps     |

Command names and route paths in the docs match the team's uuApp submission. Implementation is plain Next.js + Mongoose REST.

## Architecture in one paragraph

A HARDWARIO sensor node samples temperature and acceleration (plus PIR / magnetic / smoke in iteration 2). It sends a JSON payload over radio (or USB) to a Raspberry Pi gateway running Node-RED, Mosquitto, and MongoDB. The gateway maps the payload to an event (`tamperDetected`, `motionDetected`, etc.) and forwards it via HTTPS REST to a Next.js cloud app on Vercel, authenticating with a per-device bearer token. The cloud app (Mongoose 8 over MongoDB Atlas) persists events, evaluates alarm rules, and lets operators view dashboards, acknowledge alarms, and configure devices through a React frontend (shadcn/ui + Tailwind v4). Real-time UX uses 5-second polling. Iteration 2 adds Suricata-based packet inspection of the IoT subnet and an iptables firewall lockdown with a physical kill switch.

For diagrams and detailed flows, see [docs/architecture.md](docs/architecture.md).

## Technology at a glance

| Layer            | Stack                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Sensor node      | C + HARDWARIO SDK (LIS2DH12 accelerometer, TMP112 thermometer; iter 2: PIR, magnetic, smoke) |
| Gateway          | Raspberry Pi 4, Node-RED, Mosquitto MQTT (auth + ACL), MongoDB     |
| IDS (iter 2)     | Suricata + iptables (default-deny FORWARD)                         |
| Cloud framework  | Next.js 16 (App Router), React 19, TypeScript                      |
| Cloud DB         | MongoDB Atlas M0 (free tier, 512 MB)                               |
| ODM + validation | Mongoose 8, Zod (shared schemas FE/BE)                             |
| User auth        | Auth.js v5 (Argon2id passwords)                                    |
| Device auth      | Bearer token (`DEVICE` role), SHA-256 hashed at rest               |
| Real-time UX     | TanStack Query polling (5 s). No SSE, no WebSocket                 |
| Background tasks | Vercel Cron Jobs                                                   |
| UI               | shadcn/ui, Tailwind v4, Recharts, TanStack Query + Table           |
| Hosting          | Vercel (Next.js + Cron) + MongoDB Atlas (DB)                       |
| Dev tooling      | Bun 1.2, Vitest, Playwright, Biome                                 |

## Roles

| Code       | Name           | Notes                                                              |
| ---------- | -------------- | ------------------------------------------------------------------ |
| `ADMIN`    | Administrator  | Full access. User management, device + sensor configuration, registration token issuance. |
| `OPERATOR` | Operator       | Operational control. Watches alarms, acknowledges, reviews events. |
| `USER`     | User           | Standard user. Views state, history, notifications.                |
| `DEVICE`   | Device         | IoT device authentication. Per-device bearer token; restricted to data submission endpoints. |

Role groups: `SYS_MGMT` (`ADMIN`), `MONITORING` (`OPERATOR`, `USER`), `DEVICE_INTEGRATION` (`DEVICE`).

## Project iterations

### Iteration 1: MVP

- HARDWARIO sensor node with accelerometer + temperature
- Raspberry Pi gateway with Node-RED, Mosquitto, local MongoDB
- DEVICE-role bearer token authentication for gateway → cloud
- Backend commands: `device/register`, `device/heartbeat`, `device/list`, `device/update`, `sensor/register`, `sensor/list`, `event/create`, `event/list`, `alarm/list`, `alarm/acknowledge`, `dashboard/getOverview`, `registrationToken/issue`, plus `cron/tick` and `health`
- Web dashboard (`/dashboard`, `/devices`, `/events`, `/alarms`, `/status`, `/settings/registration-tokens`)

### Iteration 2: Network IDS layer (designed, not implemented)

- Additional sensor types on the IoT node: PIR motion, magnetic door/window contact, smoke
- Suricata IDS on the IoT subnet
- Firewall lockdown via iptables (default-deny with `-I FORWARD 1` insertion)
- Physical kill switch on GPIO 17
- Backend commands: `firewall/applyRule` plus `event/create` with `eventType: networkAnomaly`

The repository code currently delivers an iteration 1 MVP: firmware skeleton, Node-RED gateway flow, and a cloud app that accepts bearer-token device events and renders dashboard/device/alarm views. Iteration 2 is fully specified in the design documents.

## Component status

| Component                    | State                                                      |
| ---------------------------- | ---------------------------------------------------------- |
| Documentation                | complete (this iteration)                                  |
| Node firmware (`hw-node`)    | skeleton in `main.c`, needs HARDWARIO SDK wiring (I-M1)    |
| Node-RED flow (`gateway`)    | working flow with demo inject, validation, alarm branch, moving avg, local Mongo, MQTT publish, and cloud HTTP forwarder |
| Cloud app (`cloud-app`)      | MVP implementation present: login, dashboard, devices, alarms, `event/create`, bearer-token device ingest |

## Wire format (node → gateway)

```json
{
  "deviceId": "node-01",
  "timestamp": "2026-04-19T10:15:00Z",
  "temperatureC": 24.7,
  "accelG": 0.18,
  "alarm": false,
  "batteryVoltage": 2.95,
  "transport": "radio"
}
```

`deviceId` is the node identifier (matches `Device.name` in the cloud). The gateway resolves it to the cloud `Device._id` (Mongo ObjectId) and the relevant `Sensor._id` before forwarding to `POST /api/event/create`. Field semantics, validation rules, and gateway → cloud transformations are in [docs/api_contract.md](docs/api_contract.md).

## Quick start

### Cloud app (local development)

```bash
cd cloud-app
bun install
cp .env.example .env.local
bun dev                           # http://localhost:3000
```

By default the cloud app starts an in-memory MongoDB and seeds `admin@iris.local` / `admin123` plus the mock gateway token used by `scripts/mock-device.ts`. For Raspberry Pi / hardware demos, set `MONGODB_URI` in `cloud-app/.env.local` before boot so data survives restarts.

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
4. Set `CLOUD_BASE_URL`, `DEVICE_NAME`, and `DEVICE_TOKEN` for the Node-RED process; see [gateway/README.md](gateway/README.md)
5. Deploy

## Hardware bill of materials

- HARDWARIO Core Module
- HARDWARIO Radio Module (or USB CDC for wired bring-up)
- LIS2DH12 accelerometer
- TMP112 temperature sensor (or onboard MCU sensor)
- 3× AAA alkaline or LiPo battery
- Raspberry Pi 4 (2 GB RAM minimum)
- HARDWARIO USB Radio Gateway stick
- Iteration 2: PIR motion sensor, magnetic contact, smoke sensor, USB Ethernet adapter, momentary push button, RGB LED

## Next steps

- wire the firmware skeleton to real HARDWARIO SDK calls (sensors, radio, sleep)
- extend the Node-RED flow with bearer-token cloud HTTP forwarders, sensor resolution cache, and the outbox pattern
- bootstrap the Next.js project under `cloud-app/` and implement milestone M1 commands (`device/register`, `device/heartbeat`, `event/create`)
- bootstrap the dashboard under `cloud-app/src/app/(dashboard)/` and implement milestone F-M1 routes
- set up CI to lint Node-RED JSON, validate Zod schemas, run Vitest, run Playwright
