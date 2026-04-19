# IoT Design

## Scope

This document covers the IoT side of Iris Gateway: the HARDWARIO sensor node, the Node-RED gateway on Raspberry Pi, the wire protocol between them, and the runtime flow. It complements [backend_design.md](backend_design.md) (cloud side) and [api_contract.md](api_contract.md) (wire format).

## Architecture summary

Two physical devices:
- **IoT Node** — HARDWARIO Core Module with sensors; battery-powered; reports via radio or USB
- **Gateway** — Raspberry Pi 4; edge device; receives node data, forwards to cloud

Both devices authenticate to the cloud with the `DEVICE` role via a bearer token issued at `device/register`.

## IoT Node

### Description

The IoT Node is a HARDWARIO Core Module with a sensor set for tamper detection and environmental monitoring. The firmware runs a simple cycle: read sensors (temperature, accelerometer, plus PIR / magnetic / smoke in iteration 2), evaluate alarm locally, build a normalized JSON payload, and send it over radio or USB to the gateway.

### Hardware specification

| Item             | Value                                                            |
| ---------------- | ---------------------------------------------------------------- |
| Platform         | HARDWARIO Core Module (STM32L0, ARM Cortex-M0+)                  |
| Sensors (iter 1) | Accelerometer (LIS2DH12), temperature (TMP112)                   |
| Sensors (iter 2) | PIR motion, magnetic door/window contact, smoke                  |
| Power            | 3× AAA alkaline (battery voltage reported in payload)            |
| Communication    | Radio (primary) / USB (service)                                  |
| Firmware language| C                                                                |
| Repo location    | `hw-node/main.c`                                                 |

### Firmware constants

From `hw-node/main.c`:

```c
#define DEVICE_ID "node-01"
#define ALARM_THRESHOLD_G 1.20f
```

- `DEVICE_ID` — unique identifier; must match a Device registered in the cloud (`Device.name`)
- `ALARM_THRESHOLD_G` — gravity-corrected magnitude threshold in g; crossing it raises `alarm = true`

### Module layout (target refactor)

```
hw-node/
|-- main.c                 # application init and scheduler
|-- app_sensor.c/.h        # sensor reading and sampling
|-- app_alarm.c/.h         # threshold logic, alarm classification
|-- app_payload.c/.h       # JSON serialization of telemetry
|-- app_transport.c/.h     # radio / USB send abstraction
|-- app_config.h           # compile-time constants
```

| Module         | Responsibility                                                          |
| -------------- | ----------------------------------------------------------------------- |
| `main`         | HARDWARIO SDK init, scheduler registration, wake-up handler             |
| `app_sensor`   | LIS2DH12 and TMP112 drivers, event-driven sampling (iter 2: PIR interrupt, magnetic reed, smoke sensor ADC) |
| `app_alarm`    | compare accel deviation against `ALARM_THRESHOLD_G`, classify events    |
| `app_payload`  | build normalized JSON payload with `deviceId`, `timestamp`, readings    |
| `app_transport`| send payload via radio (`TWR_RADIO_PUB_TOPIC`) or USB (`twr_uart_write`)|

The current `main.c` is a single-file skeleton. Splitting it is the first iteration 1 delivery milestone (I-M2).

### Sampling strategy

- **Temperature:** polled every `TELEMETRY_INTERVAL_SEC` (default 60 s)
- **Accelerometer:** interrupt-driven on threshold breach via LIS2DH12 internal comparator
- **Battery voltage:** sampled every 10 telemetry cycles (~10 minutes)
- **Iteration 2 sensors:**
  - PIR motion — interrupt-driven on motion detected
  - Magnetic contact — interrupt-driven on state change (open/closed)
  - Smoke — polled every 30 s; alarm on threshold exceeded

### Alarm classification

The accelerometer measures total proper acceleration on three axes. At rest the magnitude is approximately 1 g (gravity). The firmware computes the gravity-corrected deviation:

```
total_g = sqrt(ax^2 + ay^2 + az^2)
deviation_g = abs(total_g - 1.0)
```

- `deviation_g` ≥ `ALARM_THRESHOLD_G` (default 1.20 g) → `alarm = true`
- `deviation_g` < threshold → `alarm = false`, included only in periodic telemetry

`abs(...)` covers both impact (magnitude > 1 g) and free-fall (magnitude ≈ 0 g during a drop). The published `accelG` field is `deviation_g` so cloud-side comparisons stay consistent.

On `alarm = true`, the firmware:
1. Sends the alarm payload immediately, bypassing the aggregation timer
2. Sets a 5-second cooldown to prevent alarm flooding on repeated impacts
3. Resumes standard sampling after cooldown

For iteration 2 sensors:
- `motionDetected` (PIR) — event with severity depending on armed state
- `doorOpened` (magnetic contact) — event with severity depending on armed state
- `smokeDetected` (smoke sensor) — event with severity `critical`

### Payload schema (node → gateway)

See [api_contract.md](api_contract.md) §1 for the authoritative schema. Summary:

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

Notes:
- `timestamp` is ISO 8601 UTC. If the node has no RTC, it sends an approximate timestamp computed from boot time + monotonic counter; the gateway re-stamps with its own clock and logs the original for observability
- Payload size budget: 256 bytes for radio MTU compatibility
- The radio link is **not authenticated** in MVP. Per-node HMAC + monotonic counter is the planned mitigation for iteration 2 (see Open questions)

### Power profile

| State       | Current draw (LIS2DH12 + TMP112 + Core Module) |
| ----------- | ---------------------------------------------- |
| Deep sleep  | ~6 µA                                          |
| Sampling    | ~2 mA for 50 ms                                |
| Radio TX    | ~22 mA for 30 ms                               |

Expected battery life on 3× AAA alkaline at default 60 s interval: 12–18 months.

### Node states (reported via heartbeat)

| State     | Meaning                                                            |
| --------- | ------------------------------------------------------------------ |
| `online`  | Heartbeats received by the gateway within the SLA window           |
| `warning` | Low battery voltage OR delayed messages OR sensor fault            |
| `offline` | No heartbeat from the node within timeout (cron flips to offline)  |

### Responsibilities

1. **Periodic telemetry (UC-002 heartbeat)** — standard interval (60 s default)
2. **Local alarm detection (UC-003 event/create)** — on threshold breach, send immediately outside the interval
3. **Normalized payload** — consistent schema (see [api_contract.md](api_contract.md))

### Service scenario (UC-008)

The technician has access to the gateway or cloud application. Through the UI they review:

- current `batteryVoltage`
- `lastSeen` (last communication time)
- alarm history
- transport channel (radio vs. USB)

Based on findings they decide on maintenance, battery replacement, or node relocation.

## Gateway (Raspberry Pi edge device)

### Description

The Iris Gateway is a Raspberry Pi 4 edge device that acts as a mediator between IoT nodes and the cloud backend. It receives data from HARDWARIO IoT nodes via MQTT protocol (after the radio bridge), preprocesses it, and forwards events to the backend API via REST with a bearer token.

### Hardware

| Item            | Value                                                            |
| --------------- | ---------------------------------------------------------------- |
| Platform        | Raspberry Pi 4 Model B                                           |
| OS              | Raspberry Pi OS Lite (64-bit, Bookworm)                          |
| Inbound conn.   | MQTT broker (Mosquitto) — receives data from HARDWARIO IoT nodes |
| Outbound conn.  | HTTPS / REST — forwards events to the backend API               |
| Power           | Fixed 5 V / 3 A power adapter                                    |

### Responsibilities

1. Receive node messages (radio bridge via MQTT, or USB serial)
2. Validate payload against schema
3. Priority-branch on `alarm = true`
4. Compute moving average for temperature telemetry (local only)
5. Persist to local MongoDB (collections `telemetry`, `alarm`)
6. Publish to internal MQTT topics for observability
7. Forward events to the cloud via `POST /api/event/create` (Bearer token authentication)
8. Send periodic `POST /api/device/heartbeat` (default every 60 s)
9. Iteration 2: run Suricata on the IoT subnet, feed events into Node-RED, apply firewall rules

### Node-RED flow (current `gateway/flows.json`)

```
[inject demo]
     │
     ▼
[Validate payload]  ──► [Publish raw]       (MQTT: iot-secure-sentinel/raw)
     │
     ▼
[Alarm priority (switch)]
     │                      │
  true│                     │false
     ▼                      ▼
[Build alarm]         [Moving average]
     │                      │
     ├──► Mongo alarm       ├──► Mongo telemetry
     ├──► MQTT alarm        ├──► MQTT telemetry
     └──► Debug alarm       └──► Debug telemetry
```

### Planned extensions to the flow

- **HTTP request nodes** with bearer token authentication to forward events to the cloud (`POST /api/event/create`, `POST /api/device/heartbeat`). Credentials loaded from `/etc/iris-gateway/credentials.json`
- **Sensor resolution** — before forwarding, resolve the logical sensor for the event. The gateway holds a small local cache of `{ deviceId → [{ sensorId, sensorType }] }` refreshed from `GET /api/sensor/list?deviceId=...` on startup and every 10 minutes
- **Event mapping** — translate node payload + sensor type into the `eventType` enum:
  - accelerometer + `alarm = true` → `tamperDetected`
  - temperature above threshold → `temperatureExceeded`
  - PIR interrupt → `motionDetected`
  - magnetic contact → `doorOpened`
  - smoke sensor → `smokeDetected`
- **Retry and backoff** for outbound HTTP on cloud outage; hold in `outbox` collection until delivered (max age 24 h per NFR6)
- **Idempotency key** added to every cloud POST: `sha256(deviceId|sensorId|timestamp|value|message)`

### Internal MQTT topics

| Topic                             | Producer           | Consumer                | Purpose                    |
| --------------------------------- | ------------------ | ----------------------- | -------------------------- |
| `iot-secure-sentinel/raw`         | Validate payload   | debug, optional sinks   | raw validated frames       |
| `iot-secure-sentinel/telemetry`   | Moving average     | dashboards, local UI    | aggregated telemetry       |
| `iot-secure-sentinel/alarm`       | Build alarm        | dashboards, local UI    | alarm events               |
| `iot-secure-sentinel/security`    | Suricata bridge    | rule engine             | IDS events (iteration 2)   |
| `iot-secure-sentinel/firewall`    | Rule engine / kill switch | iptables applier | firewall commands (iter 2) |

Mosquitto requires authentication (`mosquitto_passwd`); ACL restricts `iot-secure-sentinel/firewall` to two publishers (rule engine, kill-switch service).

### Local persistence

MongoDB on `127.0.0.1:27017`, database `iot_secure_sentinel`, collections:

- `telemetry`: one document per aggregation window (local only; not forwarded to cloud)
- `alarm`: one document per alarm event (local mirror of the event forwarded as `tamperDetected`)
- `securityEvent`: one document per IDS event (iteration 2)
- `outbox`: outbound cloud queue for offline buffering

TTL policy:
- `telemetry`: 30 days TTL
- `alarm`: no TTL (kept indefinitely for audit)
- `outbox`: purged after successful cloud delivery, max age 24 h

## Event flow (end-to-end)

```
Node (accelerometer interrupt)
   │ 1. abs(sqrt(ax²+ay²+az²) - 1.0) ≥ 1.20 g
   │ 2. build JSON payload { alarm: true, deviceId: "node-01", ... }
   │ 3. radio TX
   ▼
Radio bridge (HARDWARIO USB gateway)
   │ 4. emit MQTT on iot-secure-sentinel/raw
   ▼
Node-RED
   │ 5. validate payload
   │ 6. switch: payload.alarm === true
   │ 7. armed state gate (iter 2): if disarmed → persist locally, STOP
   │ 8. resolve sensorId from local cache (accelerometer sensor on this device)
   │ 9. build event payload { eventType: "tamperDetected", severity: "high", ... }
   │ 10. POST /api/event/create with Bearer dt_... (gateway's token)
   │     (on failure → enqueue in outbox, retry with backoff)
   ▼
Cloud (Next.js Route Handler)
   │ 11. bearer token verify → device resolved
   │ 12. Zod validate, idempotency check
   │ 13. Mongoose insert event
   │ 14. alarm rules → insert alarm (type: tamper)
   │ 15. AuditLog write
   ▼
Dashboard (polling every 5 s)
   │ 16. GET /api/alarm/list?status=active detects new id
   │ 17. toast + KPI tile update
   ▼
Operator acknowledges via alarm/acknowledge
```

Expected end-to-end latency: **0.5–5.5 seconds** typical.

## Configuration parameters

### Node-side (compile-time only; firmware rebuild required to change)

| Parameter                  | Default  | Range       | Notes                                          |
| -------------------------- | -------- | ----------- | ---------------------------------------------- |
| `DEVICE_ID`                | `node-01`| —           | must match a registered Device.name in the cloud |
| `ALARM_THRESHOLD_G`        | 1.20     | 0.1–5.0     | gravity-corrected magnitude                    |
| `TELEMETRY_INTERVAL_SEC`   | 60       | 10–3600     | sample period for periodic telemetry           |
| `COOLDOWN_AFTER_ALARM_SEC` | 5        | 0–60        | suppresses alarm flooding                      |

### Gateway-side (stored in `/etc/iris-gateway/credentials.json`)

| Parameter       | Source                              |
| --------------- | ----------------------------------- |
| `baseUrl`       | deployment env (e.g. `https://iris.example.app`) |
| `deviceId`      | returned from `device/register`     |
| `apiToken`      | returned from `device/register` (once) |

### Gateway runtime (hardcoded for MVP)

| Parameter                  | Default  | Notes                                          |
| -------------------------- | -------- | ---------------------------------------------- |
| `aggregationWindow`        | 5        | moving-average window for local telemetry      |
| `heartbeatIntervalSec`     | 60       | POST /api/device/heartbeat cadence             |
| `outboxRetryBackoff`       | 15 / 30 / 60 / 300 s cap | outbox retry schedule           |
| `outboxMaxAgeHours`        | 24       | drop after this                                |

## Wiring (Raspberry Pi gateway)

```
Raspberry Pi 4
 ├── USB      ──► HARDWARIO USB Radio Gateway (radio bridge)
 ├── Ethernet ──► Uplink (internet)
 ├── USB-Eth  ──► IoT subnet (iteration 2, Suricata SPAN)
 ├── GPIO 17  ──► Kill switch button → GND (internal pull-up)
 ├── GPIO 22  ──► RGB LED R
 ├── GPIO 23  ──► RGB LED G
 └── GPIO 24  ──► RGB LED B
```

## Failure modes and handling

| Failure                          | Detection                             | Response                                            |
| -------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Node stops sending               | Gateway `lastSeen` older than 3× interval | Flag device state `offline` via cron; dashboard indicator |
| Gateway stops sending            | Cloud `device.lastSeen` stale         | cron flips gateway to `offline`; dashboard banner   |
| Cloud unreachable                | HTTP timeout / non-2xx                | Buffer in `outbox`, retry with backoff              |
| MongoDB (local) down             | Write error                           | Log to filesystem fallback, restart Mongo service   |
| Radio link lost                  | No MQTT frames on `raw` for 5 min     | Publish system alert, switch node to USB if available |
| Clock skew > 5 minutes           | Cloud rejects with `timestampInFuture` | Gateway re-stamps with local time, logs skew        |
| Battery voltage < 2.4 V          | Included in heartbeat                 | Cloud surfaces low-battery indicator                |
| Bearer token rejected            | Cloud `unauthorized`                  | Gateway logs; re-registration required (documented) |

## Implementation roadmap

| Milestone | Scope                                                           |
| --------- | --------------------------------------------------------------- |
| I-M1      | Wire the current `main.c` skeleton to real HARDWARIO SDK calls (temperature, accelerometer) |
| I-M2      | Refactor `main.c` into the module layout above                  |
| I-M3      | Alarm interrupt path (comparator-driven wake-up)                |
| I-M4      | Extend Node-RED flow with cloud HTTP forwarders (bearer token) and outbox |
| I-M5      | Sensor resolution cache + event type mapping on the gateway     |
| I-M6      | Kill switch GPIO handler + LED status reporter                  |
| I-M7      | Add PIR, magnetic, smoke sensors to firmware (iteration 2)      |
| I-M8      | Suricata + firewall integration (iteration 2)                   |

## Out-of-scope extensions

- OTA firmware updates
- Multi-user device ownership beyond role-based access
- Additional sensor types beyond the iteration 2 set

## Open questions

1. RTC source for the node: onboard via CR2032, or timestamping at the gateway only?
2. Node identity: hardcoded `DEVICE_ID`, or derived from the MCU unique ID at flash time?
3. Radio encryption: rely on HARDWARIO default, or add application-layer per-node HMAC + monotonic counter?
4. Bearer token rotation: how do we rotate the gateway's `apiToken` when a device is replaced or potentially compromised? (Currently: re-register manually.)
