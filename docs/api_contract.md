# API Contract

## Overview

This document defines the wire-level contract between the three layers of Iris Gateway: the HARDWARIO sensor node, the Node-RED gateway on Raspberry Pi, and the Next.js cloud backend. It is the single source of truth for field names, types, and payload shapes.

Command names match the team's uuApp submission (e.g. `device/register`, `event/create`). The backend exposes them as REST endpoints under `/api/<command>`. For endpoint signatures and error codes see [backend_design.md](backend_design.md). For firmware and flow logic see [iot_design.md](iot_design.md).

## Identity model

| Term              | Format                              | Owner              | Example                          | Where it lives                                |
| ----------------- | ----------------------------------- | ------------------ | -------------------------------- | --------------------------------------------- |
| Node `deviceId`   | firmware constant, matches `name` in device collection | HARDWARIO Core | `node-01`      | node → gateway payload                        |
| Device `_id`      | Mongo ObjectId (24-hex)             | backend            | `651f2a1b3c4d5e6f7a8b9c0d`       | every cloud request after `device/register`   |
| Sensor `_id`      | Mongo ObjectId                      | backend            | `651f2b2c3d4e5f6a7b8c9d0e`       | every `event/create` payload                  |
| Registration token| `rt_<32 hex>`                       | backend (admin)    | `rt_5f7a9c1e3d4b6a8c0e2f4d6b...` | issued once, consumed at `device/register`    |
| Device API token  | `dt_<32 hex>`                       | backend            | `dt_5f7a9c1e3d4b6a8c0e2f4d6b...` | bearer token for `DEVICE` role auth           |

## 1. Node → Gateway

Transport: radio (HARDWARIO 868 MHz) or USB CDC. JSON on the wire.

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

| Field            | Type    | Required | Notes                                          |
| ---------------- | ------- | -------- | ---------------------------------------------- |
| `deviceId`       | string  | yes      | node identifier, matches `Device.name` in the cloud |
| `timestamp`      | string  | yes      | ISO 8601 UTC; if the node has no RTC, the gateway re-stamps on arrival |
| `temperatureC`   | number  | yes      | Celsius, range −40 to +85                      |
| `accelG`         | number  | yes      | gravity-corrected magnitude in g, range 0 to 16 |
| `alarm`          | boolean | yes      | true when the accelerometer threshold is breached |
| `batteryVoltage` | number  | no       | volts, 0 to 5                                  |
| `transport`      | string  | yes      | `radio` or `usb`                               |

Firmware constants:
- `DEVICE_ID = "node-01"` — must match a Device registered in the cloud
- `ALARM_THRESHOLD_G = 1.20f` — gravity-corrected magnitude threshold

## 2. Gateway-side validation

Required fields: `deviceId`, `timestamp`, `temperatureC`, `accelG`, `alarm`.

Type rules:
- `temperatureC`, `accelG`, `batteryVoltage` must be numbers
- `alarm` must be boolean
- `timestamp` must parse as ISO 8601; if off by more than 5 minutes from gateway clock, the gateway re-stamps with local time and logs the skew
- `deviceId` must match `^[a-z0-9-]{3,64}$`

Invalid payloads are dropped and logged. They are not forwarded to the cloud.

## 3. Gateway-local MongoDB documents

### Collection `telemetry`

Per-sample raw readings retained for local audit. One document per inbound node message.

```json
{
  "deviceId": "node-01",
  "timestamp": "2026-04-19T10:15:00Z",
  "temperatureC": 24.7,
  "avgTemperatureC": 24.52,
  "accelG": 0.18,
  "batteryVoltage": 2.95,
  "transport": "radio",
  "type": "telemetry"
}
```

`avgTemperatureC` is the moving average over the last `aggregationWindow` samples (default 5).

### Collection `alarm`

```json
{
  "deviceId": "node-01",
  "timestamp": "2026-04-19T10:15:05Z",
  "accelG": 1.94,
  "temperatureC": 24.9,
  "batteryVoltage": 2.94,
  "transport": "radio",
  "type": "alarm",
  "priority": "high",
  "message": "Acceleration threshold exceeded"
}
```

### Collection `outbox`

Holds cloud requests pending delivery during a cloud outage.

```json
{
  "targetPath": "/api/event/create",
  "method": "POST",
  "payload": { "...": "..." },
  "enqueuedAt": "2026-04-19T10:15:05Z",
  "attempts": 0,
  "nextAttemptAt": "2026-04-19T10:15:15Z"
}
```

Retry backoff: 15 s → 30 s → 60 s → 5 min cap. Maximum age 24 h (NFR6).

## 4. Internal MQTT topics (within the gateway)

| Topic                              | Payload                     | Purpose                        |
| ---------------------------------- | --------------------------- | ------------------------------ |
| `iot-secure-sentinel/raw`          | validated node payload      | observability, optional sinks  |
| `iot-secure-sentinel/telemetry`    | local telemetry doc         | local UI, downstream consumers |
| `iot-secure-sentinel/alarm`        | local alarm doc             | local UI, alerting             |
| `iot-secure-sentinel/security`     | IDS event (iter 2)          | rule engine                    |
| `iot-secure-sentinel/firewall`     | firewall command (iter 2)   | iptables applier               |

Mosquitto requires authentication and ACL (see [deployment.md](deployment.md)).

## 5. Gateway → Cloud (HTTP REST)

Transport: HTTPS, JSON, bearer token authentication.

### 5.0 Authentication header

```
Authorization: Bearer dt_5f7a9c1e3d4b6a8c0e2f4d6b8a0c2e4f6d8b0a2c
Content-Type: application/json
```

The API token is issued once by `device/register` and stored on the gateway at `/etc/iris-gateway/credentials.json`. The backend stores only its SHA-256 hash and compares with `crypto.timingSafeEqual`.

### 5.1 `POST /api/device/register`

No token required (device has none yet); requires a registration token.

Request body:

```json
{
  "registrationToken": "rt_5f7a9c1e3d4b6a8c0e2f4d6b8a0c2e4f",
  "name": "node-01",
  "type": "iotNode",
  "location": "Building 4, vault A",
  "firmwareVersion": "1.0.0"
}
```

For a gateway the `type` is `"gateway"` and `ipAddress` may be included.

Response `201`:

```json
{
  "device": {
    "id": "651f2a1b3c4d5e6f7a8b9c0d",
    "name": "node-01",
    "type": "iotNode",
    "status": "online",
    "location": "Building 4, vault A",
    "lastSeen": "2026-04-19T10:15:00Z"
  },
  "apiToken": "dt_5f7a9c1e3d4b6a8c0e2f4d6b8a0c2e4f6d8b0a2c"
}
```

`apiToken` is returned exactly once.

### 5.2 `POST /api/device/heartbeat`

Request body:

```json
{
  "status": "online",
  "batteryVoltage": 2.95
}
```

Response `200`:

```json
{
  "deviceId": "651f2a1b3c4d5e6f7a8b9c0d",
  "status": "online",
  "lastSeen": "2026-04-19T10:16:00Z"
}
```

### 5.3 `POST /api/event/create`

Request body:

```json
{
  "deviceId": "651f2a1b3c4d5e6f7a8b9c0d",
  "sensorId": "651f2b2c3d4e5f6a7b8c9d0e",
  "eventType": "tamperDetected",
  "severity": "high",
  "value": 1.94,
  "message": "Acceleration threshold exceeded",
  "timestamp": "2026-04-19T10:16:05Z"
}
```

`eventType` enum: `motionDetected`, `doorOpened`, `smokeDetected`, `temperatureExceeded`, `tamperDetected`, `networkAnomaly` (iter 2).
`severity` enum: `low`, `medium`, `high`, `critical`.

Response `201`:

```json
{
  "event": {
    "id": "651f5c...",
    "eventType": "tamperDetected",
    "severity": "high",
    "timestamp": "2026-04-19T10:16:05Z"
  },
  "alarmCreated": true,
  "alarmId": "651f6d..."
}
```

The backend computes an idempotency key server-side from `sha256(deviceId|sensorId|timestamp|value|message)`. Retried POSTs return the existing record without duplicate insertion.

### 5.4 `POST /api/firewall/applyRule` (iter 2)

Request body:

```json
{
  "target": "192.168.50.41",
  "action": "block",
  "reason": "networkAnomaly signature 2014020",
  "triggeredBy": "ids",
  "appliedAt": "2026-04-19T10:16:02Z",
  "expiresAt": null
}
```

`triggeredBy` enum: `killSwitch`, `ids`, `manual`.

Response `201`: `{ "id": "651f7e...", "state": "active" }`

## 6. Frontend → Cloud

The Next.js frontend calls the same Route Handlers from Server Components (`fetch`) and Client Components (TanStack Query polling). Authentication uses the Auth.js session cookie (same-origin).

Endpoints used by the UI:

- `GET /api/dashboard/getOverview` for dashboard KPIs
- `GET /api/device/list` for `/devices`
- `GET /api/event/list` for `/events`
- `GET /api/alarm/list` for `/alarms`, polled every 5 s
- `POST /api/alarm/acknowledge` for acknowledge flow
- `POST /api/device/update` for device management
- `POST /api/sensor/register` for sensor onboarding
- `POST /api/registration-token/issue` (admin) for device provisioning

Full schemas and error codes are in [backend_design.md](backend_design.md).

## 7. Real-time UX (polling)

The dashboard polls `GET /api/alarm/list?status=active` and `GET /api/dashboard/getOverview` every 5 s via TanStack Query. New alarms surface in the list and trigger a toast based on a client-side `id` delta. NFR5 (alarm visible within 5 s) is met without SSE or WebSocket.

End-to-end latency budget: detection (50 ms) + radio (50 ms) + Node-RED (100 ms) + cloud HTTP (300 ms) + Mongo insert (50 ms) + next polling tick (0–5000 ms) = **0.5–5.5 seconds**.

## 8. Error envelope (cloud responses)

```json
{
  "error": {
    "code": "invalidDtoIn",
    "message": "DtoIn is not valid.",
    "params": {
      "invalidTypeKeyMap": { "severity": "expected enum, got string" },
      "invalidValueKeyMap": {},
      "missingKeyMap": { "deviceId": "required" }
    }
  }
}
```

Successful responses may carry a warning:
```json
{
  "device": { "...": "..." },
  "warning": {
    "code": "unsupportedKeys",
    "params": { "unsupportedKeyList": ["legacyField"] }
  }
}
```

Error codes follow the team's uuApp camelCase convention (see [backend_design.md](backend_design.md) § Error envelope).

## 9. Backward compatibility notes

- `avgTemperatureC` is required on gateway-local telemetry but is **not** sent to the cloud (the node-RED flow emits a `tamperDetected` / `temperatureExceeded` event instead of raw telemetry records)
- the legacy `type` field (`telemetry | alarm`) exists only in gateway-local MongoDB to simplify collection-agnostic queries
- the gateway authenticates with its own bearer token but submits events on behalf of sensor nodes; the `deviceId` field in `event/create` is the **node's** device id, while the authenticated device (gateway) is implicit in the bearer token
- radio link MTU caps node payload at 256 bytes; new fields must fit inside this budget or move to the aggregation layer on the gateway
