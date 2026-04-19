# IoT Design

## Scope

This document covers the IoT side of Iris Gateway: the HARDWARIO sensor node, the Node-RED gateway on Raspberry Pi, the wire protocol between them, and the runtime flow. It complements [backend_design.md](backend_design.md) (cloud side) and [api_contract.md](api_contract.md) (wire format).

## Hardware

### Sensor node

- **MCU:** HARDWARIO Core Module (STM32L0, ARM Cortex-M0+)
- **Accelerometer:** LIS2DH12 (3-axis, ±2/4/8/16 g, I²C, built-in interrupt on threshold)
- **Temperature sensor:** TMP112 (±0.5 °C, I²C) or onboard MCU sensor
- **Radio:** HARDWARIO Radio Module (868 MHz, proprietary protocol)
- **Power:** 3× AAA alkaline or LiPo, battery voltage sampled from VCC divider
- **Optional:** USB CDC for wired deployment and debug

### Gateway

- **Host:** Raspberry Pi 4 (2 GB RAM minimum)
- **Radio bridge:** HARDWARIO USB Gateway stick (radio ↔ MQTT bridge) or direct USB from node
- **Kill switch (iteration 2):** momentary push button on GPIO 17, internal pull-up
- **Status LEDs (iteration 2):** RGB LED on GPIO 22/23/24 for armed / alarm / network state
- **Network:** Ethernet to uplink; second interface (USB Ethernet or Wi-Fi) dedicated to the IoT subnet

## HARDWARIO node firmware

### Module layout

```
hw-node/
|-- main.c                 # application init and scheduler
|-- app_sensor.c/.h        # sensor reading and sampling
|-- app_alarm.c/.h         # threshold logic, alarm classification
|-- app_payload.c/.h       # JSON serialization of telemetry
|-- app_transport.c/.h     # radio / USB send abstraction
|-- app_config.h           # compile-time constants (thresholds, intervals)
```

### Responsibilities per module

| Module         | Responsibility                                                          |
| -------------- | ----------------------------------------------------------------------- |
| `main`         | HARDWARIO SDK init, scheduler registration, wake-up handler             |
| `app_sensor`   | LIS2DH12 and TMP112 drivers, event-driven sampling                      |
| `app_alarm`    | compare accel magnitude against `ALARM_THRESHOLD_G`, classify events    |
| `app_payload`  | build normalized JSON payload with `deviceId`, `timestamp`, readings    |
| `app_transport`| send payload via radio (`TWR_RADIO_PUB_TOPIC`) or USB (`twr_uart_write`)|

The current `main.c` is a single-file skeleton. Splitting it into the module layout above is a refactor task for iteration 1 delivery.

### Sampling strategy

- Temperature: polled every `TELEMETRY_INTERVAL_SEC` (default 60 s)
- Accelerometer: interrupt-driven on threshold breach via LIS2DH12 internal comparator
- Continuous accel polling is disabled to save power; the comparator wakes the MCU on significant motion
- Battery voltage: sampled every 10 telemetry cycles (≈ 10 minutes by default)

### Alarm classification

The accelerometer measures total proper acceleration (3 axes). At rest the magnitude is approximately 1 g (gravity). The firmware computes the gravity-corrected deviation:

```
total_g = sqrt(ax^2 + ay^2 + az^2)
deviation_g = abs(total_g - 1.0)
```

- `deviation_g` ≥ `ALARM_THRESHOLD_G` (default 1.20 g) → `alarm = true`
- `deviation_g` < threshold → `alarm = false`, include only in periodic telemetry

`abs(...)` covers both impact (magnitude > 1 g) and free-fall (magnitude < 1 g, ~0 g during a drop). The published `accelG` field in the wire payload is `deviation_g` so cloud-side comparisons stay consistent with the threshold semantics.

On `alarm = true`, the firmware:
1. Sends the alarm payload immediately, bypassing the aggregation timer
2. Sets a 5-second cooldown to prevent alarm flooding on repeated impacts
3. Resumes standard sampling after cooldown

### Payload schema (node → gateway)

See [api_contract.md](api_contract.md) for the authoritative schema. Summary:

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

Notes:
- `timestamp` is an ISO 8601 UTC string. If the node has no RTC, it sends an approximate timestamp computed from boot time + monotonic counter; the gateway re-stamps with its own clock on arrival and logs the original value for observability.
- Payload size budget: 256 bytes for radio MTU compatibility.
- The radio link is **not authenticated** in MVP. Per-node HMAC + monotonic counter is the planned mitigation for iteration 2 (see Open questions).

### Power profile

| State       | Current draw (LIS2DH12 + TMP112 + Core Module) |
| ----------- | ---------------------------------------------- |
| Deep sleep  | ≈ 6 µA                                         |
| Sampling    | ≈ 2 mA for 50 ms                               |
| Radio TX    | ≈ 22 mA for 30 ms                              |

Expected battery life on 3× AAA alkaline at default 60 s interval: 12–18 months.

## Gateway

### Responsibilities

1. Receive node messages (radio bridge via MQTT, or USB serial)
2. Validate payload against schema
3. Priority-branch on `alarm = true`
4. Compute moving average for temperature telemetry
5. Persist to local MongoDB (collections `telemetry`, `alarm`)
6. Publish to internal MQTT topics for observability
7. Forward aggregated records to the cloud via `POST /api/telemetry` and `POST /api/alarm` (HMAC-signed)
8. Pull configuration via `GET /api/gateway/:id/config` on schedule (5 min) and apply without restart
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
     ├──► Mongo alarms      ├──► Mongo telemetry
     ├──► MQTT alarm        ├──► MQTT telemetry
     └──► Debug alarm       └──► Debug telemetry
```

### Planned extensions to the flow

- **HTTP request nodes** with HMAC + nonce signing to forward validated records to the cloud (`POST /api/telemetry`, `POST /api/alarm`); credentials loaded from `/etc/iris-gateway/credentials.json`
- **Config poll** subflow: scheduled `GET /api/gateway/:id/config` every 5 min, write result (config + armedState) to `flow.context` for use in threshold and routing decisions
- **Armed state gate**: short-circuit alarm branch when `flow.context.armedState === 'disarmed'`. Still persist to local Mongo `alarm` collection for audit; **skip cloud POST**. The gateway is the authoritative enforcement layer; the cloud has defense-in-depth handling for the rare case of a stale-state divergence
- **Retry and backoff** for outbound HTTP on cloud outage; hold in `outbox` collection until delivered (max age 24 h per NFR6)
- **Idempotency key** added by Node-RED to every cloud POST: `sha256(gatewayId + deviceId + timestamp)`. The cloud uses this to deduplicate retried requests

### Internal MQTT topics

| Topic                             | Producer           | Consumer                | Purpose                    |
| --------------------------------- | ------------------ | ----------------------- | -------------------------- |
| `iot-secure-sentinel/raw`         | Validate payload   | debug, optional sinks   | raw validated frames       |
| `iot-secure-sentinel/telemetry`   | Moving average     | dashboards, local UI    | aggregated telemetry       |
| `iot-secure-sentinel/alarm`       | Build alarm        | dashboards, local UI    | alarm events               |
| `iot-secure-sentinel/security`    | Suricata bridge    | rule engine             | IDS events (iteration 2)   |
| `iot-secure-sentinel/firewall`    | Rule engine        | iptables applier        | firewall commands (iter 2) |

### Local persistence

MongoDB on `localhost:27017`, database `iot_secure_sentinel`, collections:

- `telemetry`: one document per aggregation window
- `alarm`: one document per alarm event
- `securityEvent`: one document per IDS event (iteration 2)
- `outbox`: outbound cloud queue for offline buffering

TTL policy:
- `telemetry`: 30 days TTL via Mongo TTL index on `timestamp`
- `alarm`: no TTL (kept indefinitely for audit)
- `outbox`: purged after successful cloud delivery

## Alarm flow (end-to-end)

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
   │ 7. armed state gate: if disarmed → persist locally, STOP
   │ 8. build alarm doc (add priority, message, idempotencyKey)
   │ 9a. insert → local Mongo `alarm` collection
   │ 9b. publish MQTT iot-secure-sentinel/alarm
   │ 9c. POST → /api/alarm (HMAC + nonce; on failure → outbox retry)
   ▼
Cloud (Next.js Route Handler)
   │ 10. HMAC verify, nonce check, Zod validate
   │ 11. Mongoose insert (idempotent on key)
   │ 12. AuditLog write
   ▼
Dashboard
   │ 13. polling tick (≤ 5 s) detects new alarm in /api/alarm?state=unresolved
   │ 14. toast surfaces, KPI tile updates
   ▼
Operator
```

Expected end-to-end latency under normal network conditions: 2–7 seconds (radio + HTTP + next polling tick).

## Configuration parameters

### Node-side (compile-time only; firmware rebuild required to change)

| Parameter                  | Default  | Range       | Notes                                          |
| -------------------------- | -------- | ----------- | ---------------------------------------------- |
| `ALARM_THRESHOLD_G`        | 1.20     | 0.1–5.0     | gravity-corrected magnitude; the gateway can post-filter to a stricter value but cannot lower below this |
| `TELEMETRY_INTERVAL_SEC`   | 60       | 10–3600     | sample period for periodic telemetry           |
| `COOLDOWN_AFTER_ALARM_SEC` | 5        | 0–60        | suppresses repeated alarm flooding             |

### Gateway-side (runtime, pulled from cloud)

| Parameter                  | Default  | Range       | Notes                                          |
| -------------------------- | -------- | ----------- | ---------------------------------------------- |
| `accelThresholdG`          | 1.20     | 0.1–5.0     | post-filter on incoming `accelG` before forwarding to cloud |
| `aggregationWindow`        | 5        | 1–20        | moving-average window size for telemetry       |
| `idsEnabled`               | false    | bool        | iter 2 only                                    |
| `idsRules`                 | []       | array       | iter 2 only                                    |
| `armedState`               | armed    | enum        | gateway behavior toggle                        |

Runtime configuration is stored in the cloud `gateway.config` document and pulled by the flow via `GET /api/gateway/:id/config` (HMAC) every 5 minutes. Changes apply without restart. Compile-time parameters require a firmware rebuild; over-the-air update is out of scope for MVP.

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

| Failure                          | Detection                             | Response                                   |
| -------------------------------- | ------------------------------------- | ------------------------------------------ |
| Node stops sending               | `lastSeenAt` > 3× `telemetryInterval` | Flag gateway state `inactive`, dashboard warning |
| Cloud unreachable                | HTTP timeout / non-2xx                | Buffer in `mongo.outbox`, retry with backoff |
| MongoDB down                     | Write error                           | Log to filesystem fallback, restart Mongo service |
| Radio link lost                  | No MQTT frames on `raw` for 5 min     | Publish system alert, switch node to USB if available |
| Clock skew > 5 minutes           | Cloud rejects with `TIMESTAMP_IN_FUTURE` | Gateway re-stamps with local time, logs skew, retries via outbox |
| Battery voltage < 2.4 V          | Included in telemetry                 | Cloud surfaces a low-battery indicator on the gateway card |
| HMAC nonce reuse                 | Cloud rejects with `UNAUTHORIZED`     | Gateway regenerates nonce, retries (logs incident) |

## Implementation roadmap

| Milestone | Scope                                                           |
| --------- | --------------------------------------------------------------- |
| I-M1      | Wire the current `main.c` skeleton to real HARDWARIO SDK calls (temperature, accelerometer) |
| I-M2      | Refactor `main.c` into the module layout above                  |
| I-M3      | Alarm interrupt path (comparator-driven wake-up)                |
| I-M4      | Extend Node-RED flow with cloud HTTP forwarders and outbox      |
| I-M5      | Kill switch GPIO handler + LED status reporter                  |
| I-M6      | Suricata + firewall integration (iteration 2)                   |

## Open questions

1. RTC source for the node: onboard via CR2032, or timestamping at the gateway only?
2. Node identity: hardcoded `deviceId`, or derived from the MCU unique ID?
3. Radio encryption: rely on HARDWARIO default, or add application-layer signing?
