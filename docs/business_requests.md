# Business Requests

## Solution name

**Iris Gateway** (internal working title: IoT Secure Sentinel)

## Application description

The application is an IoT security system for monitoring objects through distributed sensors and centralized event evaluation. The system is composed of IoT nodes built on the HARDWARIO platform that collect data from sensors (motion detection, door/window contact, temperature, smoke) and forward it to a Raspberry Pi gateway.

The gateway acts as an edge tier that receives data from IoT nodes, performs preprocessing, and relays it to the backend. The backend handles application logic for security event evaluation, persists data to MongoDB, and exposes data through a REST API.

The web application lets users observe the current system state, browse event history, and react to alarms. When an abnormal state is detected (motion in a guarded area, sensor tamper, temperature out of range, smoke), the system raises an alarm event that is recorded and surfaced to the operator.

## Project iterations

### Iteration 1: MVP (current repository state)

- HARDWARIO Core Module sensor node with accelerometer + temperature
- tamper detection (acceleration above threshold) and environmental monitoring
- Raspberry Pi gateway running Node-RED, local MongoDB, Mosquitto MQTT
- HTTPS REST forwarding to the backend with DEVICE role bearer token
- web dashboard with active alarms, event history, device status, alarm acknowledgement

### Iteration 2: Extended sensor support and network IDS (designed only)

- additional sensor types on the IoT node: PIR motion, magnetic door/window contact, smoke
- Suricata IDS over the IoT subnet
- iptables firewall lockdown on detection of a compromised device
- physical kill switch on the gateway
- bidirectional cloud-to-gateway configuration push

The repository currently delivers iteration 1. Iteration 2 is fully specified in the design documents.

## Application topology

```
+---------+      +---------------+     +-----------+      +-----------+
| Sensors | ---> | HARDWARIO Node| --> | Pi Gateway| ---> | Backend   | --> MongoDB
+---------+      +---------------+     +-----------+      +-----------+
                                                                |
                                                                v
                                                          +-------------+      +------+
                                                          | Web App     | <--> | User |
                                                          +-------------+      +------+
```

Layers:
- **Object** — sensors + HARDWARIO IoT Node
- **Local Gateway** — Raspberry Pi (edge)
- **Server** — Backend API + MongoDB
- **Client** — Web application + User

## Role profiles

| Code     | Name           | Description                                                                                       |
| -------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `ADMIN`    | Administrator  | Full system access. User management, device configuration, alarm settings, all data and operations. |
| `OPERATOR` | Operator       | Operational control. Watches device state, reacts to alarms, works with current events. Cannot change system configuration. |
| `USER`     | User           | Standard user. Views security state, event history, and receives notifications.                   |
| `DEVICE`   | Device         | Role representing an IoT device (node or gateway). Used to authenticate devices against the backend; restricted to data submission endpoints. |

## Role group profiles

| Code                 | Name                | Description                                              |
| -------------------- | ------------------- | -------------------------------------------------------- |
| `SYS_MGMT`           | System Management   | Full system administration. Contains `ADMIN`.            |
| `MONITORING`         | Monitoring          | Watches the system and reacts to alarms. Contains `OPERATOR`, `USER`. |
| `DEVICE_INTEGRATION` | Device Integration  | Device-to-system communication. Contains `DEVICE`.       |

## Actors

### A1: Administrator

System owner role. Manages users, registers devices, configures sensor thresholds, audits alarms.

**Maps to role:** `ADMIN`.

### A2: Operator

Security operations role. Monitors active alarms, acknowledges incidents, reviews event history.

**Maps to role:** `OPERATOR`.

### A3: User

End-user / homeowner. Views the dashboard, receives notifications.

**Maps to role:** `USER`.

### A4: Service Technician

Performs installation, battery replacement, and on-site verification. Authenticates as Administrator.

**Maps to role:** `ADMIN`.

### A5: IoT Device (Node / Gateway)

System actor representing the gateway and the sensor node. Authenticates with a per-device bearer token (issued at registration) and assumes the `DEVICE` role for data submission.

**Maps to role:** `DEVICE`.

## Products

### P1: Iris Gateway HW

Physical appliance: Raspberry Pi 4 + HARDWARIO Core Module + sensor set (accelerometer, temperature; PIR / magnetic / smoke in iteration 2) + kill switch button.

### P2: Iris Gateway Firmware & Edge Flow

Node firmware (HARDWARIO C SDK) and the Node-RED flow running on the Pi. Local logic, local persistence, cloud forwarding.

### P3: Iris Cloud Backend

Custom Next.js 16 backend with REST endpoints, Mongoose 8 over MongoDB Atlas, role-based authorization (Auth.js v5 sessions for users, bearer tokens for devices).

### P4: Iris Web Application

React 19 frontend (single Next.js project with the backend) with shadcn/ui and TanStack Query 5-second polling.

## Business use cases

Each UC maps to one or more backend commands documented in [backend_design.md](backend_design.md).

### UC-001: Register IoT device

- **Actors:** A1 (Administrator), A4 (Service Technician); A5 (Device) executes
- **Precondition:** an Administrator has issued a registration token for the device label
- **Trigger:** first device boot (gateway or node provisioning)
- **Main flow:**
  1. Device calls `device/register` with the registration token, name, type, and location
  2. Backend validates the token, creates a `device` document, generates an API token
  3. Backend returns the `deviceId`, the API token (once), and any initial configuration
  4. Device stores credentials locally and uses the API token for subsequent calls
- **Alternative:** invalid or consumed token → `invalidToken`
- **Alternative:** device with the same `name` already exists → `deviceAlreadyExists`
- **Result:** device is registered with status `online`; can submit data

### UC-002: Device heartbeat

- **Actor:** A5 (Device)
- **Trigger:** periodic schedule (e.g. every 60 s for the gateway, configurable for the node)
- **Main flow:**
  1. Device calls `device/heartbeat` with its `deviceId`
  2. Backend verifies the device exists, updates `lastSeen`, evaluates status
- **Alternative:** unknown device → `deviceNotFound`
- **Result:** device status is `online`; cron eventually flips it to `offline` if heartbeats stop

### UC-003: Receive sensor / security event

- **Actor:** A5 (Device); A2 / A3 (passive)
- **Trigger:** sensor reading meets event criteria (accelerometer above threshold, motion detected, door opened, smoke detected, temperature out of bounds)
- **Main flow:**
  1. Device calls `event/create` with `deviceId`, `sensorId`, `eventType`, `severity`, `value`, `message`, `timestamp`
  2. Backend validates the device and sensor, persists the event
  3. Backend evaluates whether the event should trigger an alarm (severity + sensor threshold + device state)
  4. If the rule fires, the backend creates a related `alarm` document
- **Result:** event is in the audit log; if applicable an alarm is active and visible in the dashboard within the next polling tick (≤ 5 s)

### UC-004: View dashboard

- **Actors:** A1, A2, A3
- **Trigger:** user opens `/dashboard`
- **Main flow:**
  1. Frontend calls `dashboard/getOverview` for KPIs (devices online, active alarms, latest events)
  2. Frontend polls `alarm/list` and `dashboard/getOverview` every 5 s via TanStack Query
- **Result:** user sees the current security posture

### UC-005: Acknowledge alarm

- **Actor:** A1, A2
- **Precondition:** an alarm in state `active` exists
- **Trigger:** user clicks "Acknowledge" in the dashboard
- **Main flow:**
  1. Frontend calls `alarm/acknowledge` with the alarm ID and an optional note
  2. Backend changes alarm state to `acknowledged`, records `acknowledgedBy` and the time
- **Alternative:** alarm not in `active` state → `invalidAlarmState`
- **Result:** alarm is recorded as acknowledged with audit trail

### UC-006: List alarms

- **Actors:** A1, A2, A3
- **Trigger:** user opens `/alarms` or filters dashboard
- **Main flow:**
  1. Frontend calls `alarm/list` with filter (status, alarmType, date range) and pagination
  2. Backend returns the matching items and page info
- **Result:** user sees the filtered alarm list

### UC-007: View device list and status

- **Actors:** A1, A2
- **Trigger:** user opens `/devices` or `/status`
- **Main flow:**
  1. Frontend calls `device/list` (devices with current status, lastSeen, location)
  2. Frontend calls `event/list` for recent activity per device
- **Result:** operator sees device health and recent activity

### UC-008: Service device (battery, placement, sensor reconfig)

- **Actor:** A4 (Service Technician, authenticates as `ADMIN`)
- **Precondition:** device is registered and visible in the dashboard
- **Trigger:** scheduled maintenance, low battery indicator, missed heartbeats
- **Main flow:**
  1. Technician opens `/devices/:id` in the web app, reviews `batteryVoltage`, `lastSeen`, alarm history
  2. Technician performs the physical task (battery replacement, relocation, sensor calibration)
  3. After service the device sends `device/heartbeat` and an optional `device/update` to refresh location
- **Result:** device returns to `online`, history is preserved

### UC-009 (iteration 2): Detect compromised IoT device on the subnet

- **Actor:** A5 (Gateway IDS), A1
- **Trigger:** Suricata signature hit on the IoT subnet
- **Main flow:**
  1. Suricata writes the event to `eve.json`; the gateway parses it
  2. Gateway calls `event/create` with `eventType: "networkAnomaly"` and severity from the signature
  3. Backend persists the event; alarm rules may create an `alarm` of type `technical`
- **Result:** audit record, optionally an automatic firewall action (UC-010)

### UC-010 (iteration 2): Lock down compromised host or subnet

- **Actor:** A1 (manual via dashboard) or A5 (Gateway autonomously) or A3 (kill switch)
- **Trigger:** UC-009 outcome, manual UI action, or kill switch hold
- **Main flow:**
  1. Gateway inserts an iptables rule at the top of the FORWARD chain to block the host or subnet
  2. Gateway calls `firewall/applyRule` with `target`, `action`, `reason`, `triggeredBy`
  3. Backend persists the rule for audit and dashboard visibility
- **Result:** the compromised device is disconnected; rule is auditable

## Main business requirements

| ID  | Requirement                                                                                  |
| --- | -------------------------------------------------------------------------------------------- |
| BR1 | Detect tamper events on the sensor node and forward them with priority outside the standard sample interval. |
| BR2 | Measure environmental telemetry (temperature) at least once per minute and persist an aggregate. |
| BR3 | Reduce cloud data volume by aggregating standard telemetry on the gateway (moving average, one upload per window of N samples). |
| BR4 | Persist all events locally on the gateway so that a cloud outage does not cause data loss.    |
| BR5 | Use one shared schema vocabulary across node, gateway, and cloud (no field renaming between layers). |
| BR6 | (iter 2) Run packet inspection and decision logic on the gateway (privacy-by-design); the cloud receives aggregated security events only. |
| BR7 | (iter 2) Provide a physical kill switch that applies a network lockdown without depending on the cloud. |

## Out of scope

- multi-tenant isolation beyond per-deployment scoping
- email / SMS / push notification channels in MVP
- ML-based anomaly detection
- OTA firmware updates
- multi-gateway failover

## Non-functional requirements

| ID    | Requirement                                                                                  |
| ----- | -------------------------------------------------------------------------------------------- |
| NFR1  | Modular firmware and Node-RED flow; one module per responsibility.                           |
| NFR2  | Local Pi deployment under 30 min per the deployment guide; cloud deploy under 5 min on Vercel. |
| NFR3  | Audit log for every alarm acknowledgement, configuration change, registration token issuance, and role change. |
| NFR4  | Sensor and event model is extensible (new sensor types and event types without breaking changes). |
| NFR5  | Alarm reaches the cloud within 5 s of detection; the dashboard surfaces it within 5 s via polling. End-to-end target: 10 s worst case. |
| NFR6  | A cloud outage of up to 24 h must not cause data loss (gateway outbox retention).            |

## Success metrics

- alarm processed without waiting for the standard aggregation interval (verified end-to-end)
- standard telemetry forwarded in aggregated form
- 1-hour cloud outage during testing causes no data loss
- data model consistent across all layers (verified by Zod schema validation)
- gateway survives reboot and restores its registered state from local storage

## User stories

- **US-01:** As an Administrator I want to register a new device with a one-time token so that only authorized devices can submit data.
- **US-02:** As an Operator I want to see active alarms on one screen so I can react quickly.
- **US-03:** As an Operator I want to acknowledge an alarm with a note so the audit trail records the decision.
- **US-04:** As a User I want to view the current state of all devices so I know the system is running.
- **US-05:** As an Administrator I want to set the alarm threshold per sensor so different rooms can have different sensitivity.
- **US-06:** As a Service Technician I want to see device battery and lastSeen so I can plan maintenance.
- **US-07 (iter. 2):** As an Administrator I want a view of which IoT subnet device is communicating abnormally so I can decide on lockdown.
- **US-08 (iter. 2):** As a User I want a single button press to disconnect IoT devices from the internet when I suspect an attack.

## Use case → backend command mapping

| UC      | Command                  | HTTP Method | Profiles                     |
| ------- | ------------------------ | ----------- | ---------------------------- |
| UC-001  | `device/register`        | POST        | `ADMIN`, `DEVICE`            |
| UC-002  | `device/heartbeat`       | POST        | `DEVICE`                     |
| UC-003  | `event/create`           | POST        | `DEVICE`                     |
| UC-004  | `dashboard/getOverview`  | GET         | `ADMIN`, `OPERATOR`, `USER`  |
| UC-005  | `alarm/acknowledge`      | POST        | `ADMIN`, `OPERATOR`          |
| UC-006  | `alarm/list`             | GET         | `ADMIN`, `OPERATOR`, `USER`  |
| UC-007  | `device/list`            | GET         | `ADMIN`, `OPERATOR`          |
| UC-007  | `event/list`             | GET         | `ADMIN`, `OPERATOR`, `USER`  |
| UC-008  | `device/update`          | POST        | `ADMIN`                      |
| UC-009  | `event/create`           | POST        | `DEVICE`                     |
| UC-010  | `firewall/applyRule`     | POST        | `DEVICE`                     |

Detailed request/response schemas are in [backend_design.md](backend_design.md).
