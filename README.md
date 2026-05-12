# Iris Gateway (IoT Secure Sentinel)

Semester project for the *Internet of Things (uuklient)* course.

`Iris Gateway` is the product name. `IoT Secure Sentinel` is the repository name.

## What it does

IoT security system for protected spaces. Distributed sensors on a HARDWARIO node detect tamper, motion, temperature, and battery level. A Raspberry Pi gateway aggregates events and forwards them to a Next.js cloud backend on AWS Amplify Hosting. Operators view state, browse history, and acknowledge alarms through a web dashboard at `iris-gateway.cz`.

## Architecture

```
HARDWARIO node              Raspberry Pi gateway              AWS cloud
+----------------+   USB    +-------------------+   HTTPS    +-------------------+
| Core Module    | <------> | Node-RED + Mongo  | <--------> | Next.js on        |
| accelerometer  |          | + Mosquitto       |   Bearer   | Amplify Hosting   |
| temperature    |          |                   |   token    | (Lambda + CF + S3)|
+----------------+          +-------------------+            +---------+---------+
                                                                       |
                                                                       v
                                                            +-------------------+
                                                            | MongoDB Atlas M0  |
                                                            | (eu-central-1)    |
                                                            +-------------------+
```

A HARDWARIO sensor node samples temperature and acceleration. It sends JSON over USB/radio to a Raspberry Pi gateway running Node-RED, Mosquitto, and local MongoDB. The gateway maps payloads to events (`tamperDetected`, `temperatureCritical`, etc.) and forwards them via HTTPS to `POST /api/event/create` with a per-device bearer token. The cloud app (Next.js 15 + Mongoose 9 on MongoDB Atlas) persists events, evaluates alarm rules, and serves the operator dashboard. UX uses TanStack Query polling at 5s.

Iteration 2 (designed, not implemented) adds PIR/magnetic/smoke sensors, Suricata IDS on the IoT subnet, and an iptables firewall lockdown with a GPIO kill switch.

## Tech stack

| Layer | Stack |
|---|---|
| Sensor node | C + HARDWARIO SDK, LIS2DH12 accelerometer, TMP112 |
| Gateway | Raspberry Pi 4, Node-RED, Mosquitto MQTT (auth + ACL), MongoDB |
| Cloud framework | Next.js 15 (App Router), React 19, TypeScript 6 |
| Cloud DB | MongoDB Atlas M0 (free, 512 MB, eu-central-1) |
| ODM + validation | Mongoose 9, Zod 4 |
| User auth | NextAuth v4 credentials, Argon2id passwords |
| Device auth | Bearer token (`DEVICE` role), SHA-256 hashed |
| UI | Tailwind v4, lucide-react, sonner |
| Real-time | TanStack Query polling (5s alarms, 10s devices) |
| Hosting | AWS Amplify Hosting (Lambda + CloudFront + S3) |
| DNS | WEDOS, ACM cert |
| Infra-as-code | Terraform 1.9+, hashicorp/aws 6.44 |
| Dev tooling | Bun 1.3, Vitest 4 |

## Roles

| Code | Name | Notes |
|---|---|---|
| `ADMIN` | Administrator | Full access, user + device management |
| `OPERATOR` | Operator | Watches alarms, acknowledges, reviews events |
| `USER` | User | Views state, history |
| `DEVICE` | Device | IoT bearer token, data submission only |

## Repository layout

```
iot-secure-sentinel/
+-- README.md            # This file
+-- docs/                # Design and business documentation
+-- hw-node/             # HARDWARIO Core Module firmware
+-- gateway/             # Node-RED flow and helper scripts
+-- cloud-app/           # Next.js cloud application
+-- infra/               # Terraform stack for AWS Amplify Hosting
```

## Documentation

| Document | Audience |
|---|---|
| [docs/business_requests.md](docs/business_requests.md) | examiners, product |
| [docs/architecture.md](docs/architecture.md) | new contributors |
| [docs/api_contract.md](docs/api_contract.md) | implementers across layers |
| [docs/backend_design.md](docs/backend_design.md) | cloud team |
| [docs/frontend_design.md](docs/frontend_design.md) | frontend team |
| [docs/iot_design.md](docs/iot_design.md) | firmware + gateway team |
| [docs/deployment.md](docs/deployment.md) | operators |
| [docs/raspberry-pi-gateway-setup.md](docs/raspberry-pi-gateway-setup.md) | gateway operators |

Command names and route paths follow the team's uuApp submission. Implementation is plain Next.js + Mongoose REST.

---

# Cloud app (`cloud-app/`)

Next.js cloud app for Iris Gateway. Holds the React frontend and REST API (Route Handlers under `src/app/api/`). Endpoints follow uuApp command names (`event/create` -> `POST /api/event/create`).

## Local development

```bash
cd cloud-app
bun install
cp .env.example .env.local
bun dev                               # http://localhost:3000
```

`NEXTAUTH_SECRET` must be at least 32 random bytes:

```bash
openssl rand -base64 32
```

By default the first request boots an in-memory MongoDB and seeds:

- admin `admin@iris.local` / `admin123` (override via `SEED_ADMIN_*`)
- mock gateway device `mock-gateway-01` with token `mock-token-please-rotate`

Production refuses defaults and requires `MONGODB_URI`, `SEED_ADMIN_PASSWORD`, `SEED_DEVICE_TOKEN`.

```bash
bun run test       # vitest, 95 tests
bun run build      # next build
```

## Demo without hardware

Two terminals:

```bash
# T1
bun dev

# T2 (after signing in at /login)
bun run mock-device
```

Mock device POSTs scenario `temperature normal -> tamper -> temperature critical -> battery critical -> heartbeat` on a loop. Dashboard updates via polling.

## Endpoints

| Command | Method | Path | Auth |
|---|---|---|---|
| `event/create` | POST | `/api/event/create` | Bearer device token |
| `cron/tick` | GET | `/api/cron/tick` | `CRON_SECRET` in production |
| `device/list` | GET | `/api/device/list` | Session |
| `dashboard/overview` | GET | `/api/dashboard/overview` | Session |
| `alarm/list` | GET | `/api/alarm/list?state=open&limit=100` | Session |
| `alarm/acknowledge` | POST | `/api/alarm/acknowledge` | Session (OPERATOR+) + same-origin |

Errors use uuApp shape: `{ "uuAppErrorMap": { "<code>": { "type": "error", "message": "..." } } }`. Common codes: `invalidDtoIn`, `timestampInFuture`, `invalidAlarmState`, `unauthorized`, `forbidden`, `deviceNotFound`. Full list in [docs/api_contract.md](docs/api_contract.md) section 8.

---

# Cloud deployment (`infra/`)

Terraform stack for AWS Amplify Hosting in account `116921840130`, region `eu-central-1`.

## What it provisions

- `aws_amplify_app` (`WEB_COMPUTE`, monorepo root `cloud-app/`, Amplify GitHub App)
- `aws_amplify_branch` for `main` (Next.js SSR, env vars)
- `aws_amplify_webhook`
- `aws_iam_role` for Amplify SSR runtime (CloudWatch logs)
- `aws_amplify_domain_association` (`var.custom_domain`, optional)

Atlas cluster and WEDOS DNS records are outside Terraform state.

## Cost

| Item | / mo |
|---|---|
| Amplify build minutes | ~$1 |
| Amplify hosting + SSR | $5-10 |
| Amplify data transfer | ~$1 |
| Atlas M0 | $0 (free) |
| WEDOS .cz doména | 11 Kč (130 Kč / year) |
| **Total** | **~$7-12 / mo** |

## Deploy

```bash
cd infra

cp terraform.tfvars.example terraform.tfvars
# vyplň: github_access_token, mongodb_uri, auth_secret,
#        seed_admin_password, seed_device_token, custom_domain

set -a; source .env; set +a       # AWS_ACCESS_KEY_ID + SECRET

terraform init
terraform plan -out tfplan
terraform apply tfplan
terraform output
```

First build 4-6 min, subsequent pushes 2-3 min.

## Update

Push to `main` on the fork. Amplify rebuilds via webhook. For `.tf` changes use `terraform plan` + `apply`.

## Tear down

```bash
terraform destroy
```

Atlas, WEDOS, GitHub fork remain (outside TF state).

## Files

| File | Purpose |
|---|---|
| `main.tf` | Provider, version pin, default tags |
| `variables.tf` | Inputs + validation |
| `iam.tf` | Amplify SSR service role |
| `amplify.tf` | App, branch, webhook, build spec |
| `domain.tf` | Custom domain association |
| `outputs.tf` | App URL, DNS records for the registrar |
| `bin/wedos-dns.sh` | Helper for WEDOS DNS via WAPI |
| `.env`, `.terraform-deployer-policy.json`, `terraform.tfvars` | Gitignored secrets |

## Constraints

- Amplify Hosting supports Next.js 12-15, not 16. Cloud-app pinned to `^15.5.18`.
- Amplify console env vars are build-time only. Build phase greps them into `.env.production` before `next build` so SSR runtime sees them.
- Image optimization output cap: 4.3 MB.
- Cold start: 1-2s after idle.

---

# Gateway (`gateway/`)

Node-RED flow for the Raspberry Pi edge gateway. Accepts normalized HARDWARIO node payloads, stores/publishes local telemetry, forwards MVP events to the cloud app.

## Payload mapping

Node payload shape:

```json
{
  "deviceId": "node-01",
  "timestamp": "2026-05-04T10:15:00.000Z",
  "temperatureC": 24.7,
  "accelG": 0.18,
  "alarm": false,
  "batteryVoltage": 2.95,
  "transport": "radio"
}
```

Mapped to cloud contract:

- `alarm: true` -> `type: "tamper"`, `sensorKey: "core-accelerometer"`
- normal telemetry -> `type: "temperature"`, `sensorKey: "core-thermometer"`
- `batteryVoltage` -> `type: "battery"`, `sensorKey: "core-battery"`

## Cloud forwarder config

Set these for the Node-RED process:

```bash
CLOUD_BASE_URL=http://<notebook-ip>:3000     # or https://iris-gateway.cz for prod
DEVICE_NAME=mock-gateway-01
DEVICE_TOKEN=mock-token-please-rotate
```

For the systemd service from [docs/deployment.md](docs/deployment.md):

```ini
Environment="CLOUD_BASE_URL=https://iris-gateway.cz"
Environment="DEVICE_NAME=iris-gateway-prod"
Environment="DEVICE_TOKEN=<seed_device_token from terraform.tfvars>"
```

Reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart nodered
```

`DEVICE_NAME` + `DEVICE_TOKEN` must match `SEED_DEVICE_NAME` + `SEED_DEVICE_TOKEN` from the cloud-app environment, otherwise the gateway gets 401 on `POST /api/event/create`.

## First hardware demo

1. Start cloud-app on the notebook: `bun dev --hostname 0.0.0.0`
2. On the Pi: `curl http://<notebook-ip>:3000/login` (sanity check)
3. Import `gateway/flows.json` into Node-RED
4. Configure MQTT broker node to `127.0.0.1:1883`
5. Configure or disconnect MongoDB output nodes if local Mongo not installed
6. Click the `Demo payload` inject node
7. Check `Cloud response` debug node for `201` or `200 duplicate`

---

# Hardware

- HARDWARIO Core Module
- HARDWARIO Radio Module (or USB CDC for wired bring-up)
- LIS2DH12 accelerometer
- TMP112 temperature sensor (or onboard MCU)
- 3x AAA alkaline / LiPo
- Raspberry Pi 4 (2 GB minimum)
- HARDWARIO USB Radio Gateway

Iteration 2 additions: PIR motion, magnetic door/window contact, smoke sensor, USB Ethernet, momentary push button, RGB LED.

## Wire format (node -> gateway)

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

The gateway resolves `deviceId` to `Device._id` (Mongo ObjectId) before forwarding. Full field semantics in [docs/api_contract.md](docs/api_contract.md).
