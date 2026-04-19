# Business Requests

## Solution name

**Iris Gateway** (internal working title: IoT Secure Sentinel)

## Vision

Iris Gateway is a local security node for protected spaces. It monitors physical tampering, environmental conditions, and IoT network traffic in a given area. Decision logic runs locally on the gateway. The cloud handles visualization, configuration, and long-term audit.

## Business problem

Small organizations and homes deploy large numbers of low-cost IoT devices without security guarantees. These devices often communicate unencrypted and never receive firmware updates. At the same time, protected spaces (server rooms, archives, technical rooms) require basic environmental monitoring and physical tamper detection.

Pure cloud solutions fail during connectivity outages and hand security-sensitive data to a third party. Iris Gateway solves both: decisions stay local, only aggregated data and alarm events go to the cloud.

## Project iterations

The project has two iterations with explicit MVP scope:

### Iteration 1: MVP (current repository state)

- tamper detection via accelerometer
- temperature monitoring
- local Node-RED flow with validation, aggregation, persistence
- local MongoDB persistence (alarms, telemetry, outbox)
- HTTPS forwarding to the cloud with HMAC authentication
- cloud dashboard with alarm acknowledgement, threshold configuration, arm/disarm

### Iteration 2: Network IDS layer (design only, not implemented)

- packet inspection over the IoT subnet (Suricata)
- firewall lockdown via iptables on detection of a compromised device
- physical kill switch (button on the gateway)
- bidirectional cloud ↔ gateway communication for arming and rule configuration

The documentation covers both iterations. The repository code currently delivers iteration 1.

## Actors

### A1: Security Operator

Operations role in the IT team or facility management. Watches alarm state, acknowledges incidents, manages thresholds. Works primarily with the React dashboard.

**Main interests:** quick view of current state, audit of alarm events, configuration of thresholds and rules.

### A2: IT Administrator

Technical role. Deploys gateways, manages devices (nodes), maintains IDS rules, integrates with monitoring stacks.

**Main interests:** device registration, firmware configuration, IDS rules, log integration into SIEM.

### A3: Service Technician

Performs installation and physical maintenance of nodes and gateways.

**Main interests:** post-install verification, threshold calibration, battery replacement.

### A4: Homeowner

Simplified user role. Sees the armed/disarmed state, receives notifications, can press the kill switch.

**Main interests:** confidence the system is running, simple disarm during false alarms.

### A5: Iris Cloud App

System actor. Receives data from gateways, stores it, presents it to users.

### A6: IoT Devices in the Subnet

Passive actor for iteration 2. Target subject of the IDS layer monitoring and potential firewall lockdown.

## Actor → role mapping

The cloud uses four authorization roles. Actors map onto roles as follows:

| Actor                         | UserRole         | Notes                                                     |
| ----------------------------- | ---------------- | --------------------------------------------------------- |
| A1 Security Operator          | `operator`       | acknowledges alarms, toggles armed state                  |
| A2 IT Administrator           | `admin`          | full access incl. registration tokens and config changes  |
| A3 Service Technician         | `admin`          | installs gateways, needs registration token issuance      |
| A4 Homeowner                  | `user`           | simplified view, can disarm and acknowledge               |
| public dashboard / read-only  | `reader`         | view only, no mutations                                   |
| A5 Iris Cloud App             | system           | runtime; no UserRole                                      |

The default role for newly created accounts is `reader`. `admin` must explicitly elevate.

## Products

### P1: Iris Gateway HW

Physical appliance (Raspberry Pi 4 + HARDWARIO Core Module + accelerometer + temperature sensor + kill switch button). Delivered as a turn-key unit.

### P2: Iris Gateway Firmware & Flow

Node firmware (HARDWARIO C SDK) and the Node-RED flow running on Raspberry Pi. Local logic and persistence.

### P3: Iris Cloud App

Custom Next.js 16 application (App Router) with React 19 frontend, Mongoose models on MongoDB Atlas. Visualization, configuration, audit.

## Business use cases

Formal catalog. The `UC-XXX` IDs are referenced in other documents (`backend_design.md`, `frontend_design.md`).

### UC-001: Register gateway in the cloud

- **Actor:** A2 (IT Administrator) or A3 (Service Technician)
- **Precondition:** gateway is installed and has connectivity; an admin has issued a registration token
- **Trigger:** first gateway boot
- **Main flow:**
  1. Gateway calls `POST /api/gateway/register` with its `deviceId` (gateway hardware id, e.g. `iris-gw-001`) and the registration token
  2. Cloud validates the token, creates a `Gateway` document, generates an HMAC secret
  3. Cloud returns `gatewayId`, the HMAC secret (once), and the initial configuration
  4. Gateway stores credentials in `/etc/iris-gateway/credentials.json`
- **Alternative:** token invalid or already used → `INVALID_TOKEN`
- **Alternative:** `deviceId` already registered → `GATEWAY_ALREADY_EXISTS`
- **Result:** gateway is paired with the cloud and holds current configuration

### UC-002: Receive standard telemetry

- **Actors:** A5 (cloud), A2 (passive)
- **Precondition:** UC-001 completed
- **Trigger:** gateway sends an aggregated telemetry record
- **Main flow:**
  1. Gateway calls `POST /api/telemetry` with HMAC headers and a payload matching `api_contract.md` (sensor `deviceId` plus `gatewayId`)
  2. Cloud validates HMAC, validates DTO with Zod, inserts into the `telemetry` collection, updates `gateway.lastSeenAt`
  3. Cloud returns `{ id }`
- **Alternative:** Zod validation fails → `INVALID_DTO`
- **Alternative:** timestamp drift > 5 min → `TIMESTAMP_IN_FUTURE`
- **Result:** telemetry is available via `GET /api/telemetry`

### UC-003: Receive alarm event

- **Actors:** A5 (cloud), A1 (passive)
- **Precondition:** gateway is armed (otherwise the gateway flow does not forward the alarm; see UC-008)
- **Trigger:** gateway detects acceleration threshold breach
- **Main flow:**
  1. Gateway calls `POST /api/alarm` outside the standard aggregation window
  2. Cloud stores the alarm with `priority: high`, `state: unresolved`
  3. The alarm becomes visible to operators on the next dashboard refresh (within 5 s polling interval)
- **Alternative:** alarm received while gateway is reported as `disarmed` in the cloud → `200 OK` with warning code `gateway/disarmed`; alarm stored with `priority: low` and not propagated
- **Result:** alarm is in the dashboard, security operator sees it within 5 s

### UC-004: View dashboard

- **Actors:** A1 (Security Operator), A4 (Homeowner, simplified view), A2
- **Trigger:** user opens `/` or `/gateway/:id`
- **Main flow:**
  1. Server Component fetches `GET /api/gateway` and `GET /api/alarm?state=unresolved`
  2. Client Components poll the same endpoints every 5 s via TanStack Query
  3. Detail screen calls `GET /api/gateway/:id`, `GET /api/telemetry?gatewayId=...`, `GET /api/alarm?gatewayId=...`
- **Result:** user sees gateway list, KPI tiles, recent alarms, telemetry charts

### UC-005: Acknowledge alarm

- **Actor:** A1 (Security Operator)
- **Precondition:** an alarm in state `unresolved` exists
- **Trigger:** user clicks "Acknowledge" in the dashboard
- **Main flow:**
  1. Frontend calls `POST /api/alarm/:id/acknowledge` with the alarm ID and a note
  2. Cloud changes alarm state to `acknowledged`, writes who/when, returns the updated alarm
- **Alternative:** alarm already acknowledged → `INVALID_STATE`
- **Result:** alarm is marked resolved with audit trail

### UC-006: Configure thresholds and rules

- **Actor:** A2 (IT Administrator) or A1 (Security Operator)
- **Trigger:** user changes acceleration threshold or IDS rules in `/settings/gateway/:id`
- **Main flow:**
  1. Frontend calls `PATCH /api/gateway/:id/config` with the new values
  2. Cloud validates ranges with Zod, stores the configuration, bumps `configVersion`, writes audit log
  3. Gateway calls `GET /api/gateway/:id/config` on its next 5-min poll, reads new values, applies them in Node-RED without a restart
- **Alternative:** threshold out of allowed range → `INVALID_THRESHOLD`
- **Result:** new configuration is active on the gateway within 5 min

### UC-007: Notify security operator

- **Actors:** A5 (cloud), A1
- **Trigger:** UC-003 (alarm created)
- **Main flow:**
  1. The dashboard polls `GET /api/alarm?state=unresolved` every 5 s
  2. New alarms appear in the alarm list and the unresolved KPI tile
  3. A toast surfaces from the polling delta (client-side comparison of last-known IDs)
- **Out of scope for MVP:** push notifications via email, SMS, or external channels (Slack, Teams). The polling mechanism inside the dashboard is the only real-time channel for MVP.
- **Result:** operator sees the alarm within 5 s of cloud ingestion

### UC-008: Arm / disarm the system

- **Actor:** A1, A4 (cloud-side); A4 via kill switch (gateway-side, iter 2)
- **Trigger:** state toggle in the UI, or kill switch press
- **Main flow:**
  1. UI calls `PATCH /api/gateway/:id/armed-state` with `armed | disarmed`
  2. Cloud stores the requested state, bumps `configVersion`, writes audit log
  3. Gateway pulls the new state on its next config poll (5-min cadence) and applies it locally
  4. The Node-RED flow short-circuits the alarm branch when `armedState === 'disarmed'`: it persists the event to local Mongo for audit but **does not** forward to the cloud
- **Result:** gateway either reacts to alarms or stays silent

### UC-009 (iteration 2): Detect compromised IoT device

- **Actors:** A2, gateway IDS
- **Trigger:** Suricata on the gateway detects a suspicious traffic pattern
- **Main flow:**
  1. Suricata writes the event to `/var/log/suricata/eve.json`
  2. Node-RED parses the line and applies local rules
  3. Gateway calls `POST /api/security-event` to the cloud (audit only)
  4. Cloud stores the event in the `securityEvent` collection
- **Result:** audit record, optionally an automatic action (UC-010)

### UC-010 (iteration 2): Lock down IoT subnet

- **Actor:** A1 (manual via dashboard or via kill switch) or gateway (autonomous)
- **Trigger:** UC-009 outcome, manual UI action, or kill switch hold
- **Main flow:**
  1. Gateway inserts an iptables rule at the top of the FORWARD chain to block the host or subnet
  2. Gateway calls `POST /api/firewall/rule` to the cloud (audit only)
  3. State is visible in the dashboard
- **Result:** the compromised device is disconnected from the network

## Main business requirements

### BR1: Tamper detection

The system must classify acceleration above the threshold as an alarm and forward it with priority, outside the aggregation window.

### BR2: Environmental monitoring

The system must measure temperature at least once per minute and store an aggregate.

### BR3: Reduced cloud data volume

Standard telemetry going to the cloud is aggregated. The gateway computes a moving average over a 5-sample window and sends one aggregated record per window (one upload per ~5 minutes for the default 60 s sample interval). Full resolution stays local in the gateway's MongoDB.

### BR4: Local data availability

The gateway persists everything to local MongoDB. A cloud outage must not cause data loss; failed uploads queue in the gateway's `outbox` collection and retry with backoff.

### BR5: Cloud integration readiness

The data model uses shared Zod schemas across gateway, backend Route Handlers, and frontend forms. Field names are consistent end-to-end with no per-layer renaming.

### BR6 (iteration 2): Privacy-by-design IDS

Packet inspection and decision logic run on the gateway only. The cloud receives aggregated security events without packet payloads.

### BR7 (iteration 2): Manual kill switch

The physical button on the gateway must apply the lockdown without any dependency on the cloud or the network.

## Out of scope

- multi-tenant isolation beyond per-deployment scoping
- push notification channels (email, SMS, Slack, Teams) in MVP
- advanced analytics (ML anomaly detection)
- OTA firmware updates
- failover between multiple gateways

## Non-functional requirements

- **NFR1 (clarity):** firmware and flow logic stay modular, one module per responsibility
- **NFR2 (deployment):** local Raspberry Pi 4 deployment in under 30 minutes per the deployment guide; cloud deployment from `git push` to live URL on Vercel in under 5 minutes
- **NFR3 (audit):** every alarm acknowledgement, config change, armed-state change, and security event has an audit record (who, when, what)
- **NFR4 (extensibility):** the data model allows new sensors without breaking changes
- **NFR5 (alarm latency):** an alarm reaches the cloud within 5 seconds of threshold breach; the dashboard surfaces it within 5 seconds via polling. End-to-end target: 10 seconds worst case
- **NFR6 (resilience):** a cloud outage of up to 24 hours must not cause data loss (gateway outbox retention)

## Success metrics

- alarm is processed without waiting for the aggregation interval (verified by end-to-end test)
- standard telemetry reaches the cloud aggregated; one record per 5-sample window instead of one per sample
- a 1-hour cloud outage during testing causes no data loss
- the data model is consistent across all layers (verified by Zod schema validation)
- the gateway survives a reboot and restores the armed/disarmed state from stored configuration

## User stories (selection for week 5 grading)

- **US-01:** As a security operator I want to see the current state of all gateways on one screen so I can spot an outage without waiting for an alarm.
- **US-02:** As an IT administrator I want to set the acceleration threshold per gateway because different rooms have different background vibration.
- **US-03:** As a security operator I want to acknowledge an alarm with a note so the audit trail records the decision.
- **US-04:** As a homeowner I want to switch the system to disarmed in one click so I don't get notifications during maintenance.
- **US-05:** As a service technician I want the gateway itself to show that it receives node data so I don't have to open the cloud app on site.
- **US-06:** As a security operator I want to see new alarms in the dashboard within 5 seconds so I can react before damage occurs.
- **US-07 (iter. 2):** As an IT administrator I want a view of which IoT device in the subnet is communicating abnormally so I can decide on a lockdown.
- **US-08 (iter. 2):** As a homeowner I want a single button press to disconnect all IoT devices from the internet when I suspect an attack.

## Use case → REST endpoint mapping

| UC      | Endpoint                                    | Method | Auth          |
| ------- | ------------------------------------------- | ------ | ------------- |
| UC-001  | `/api/gateway/register`                     | POST   | token         |
| UC-002  | `/api/telemetry`                            | POST   | HMAC          |
| UC-003  | `/api/alarm`                                | POST   | HMAC          |
| UC-004  | `/api/gateway`                              | GET    | session       |
| UC-004  | `/api/gateway/:id`                          | GET    | session       |
| UC-004  | `/api/telemetry`                            | GET    | session       |
| UC-004  | `/api/alarm`                                | GET    | session       |
| UC-005  | `/api/alarm/:id/acknowledge`                | POST   | session+role  |
| UC-006  | `/api/gateway/:id/config`                   | GET    | HMAC          |
| UC-006  | `/api/gateway/:id/config`                   | PATCH  | session+role  |
| UC-007  | (polling on `GET /api/alarm`)               | —      | session       |
| UC-008  | `/api/gateway/:id/armed-state`              | PATCH  | session+role  |
| UC-009  | `/api/security-event`                       | POST   | HMAC          |
| UC-010  | `/api/firewall/rule`                        | POST   | HMAC          |

Detailed request/response schemas are in [backend_design.md](backend_design.md).
