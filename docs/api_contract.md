# API Contract

## Overview

This document defines the wire-level contract between the three layers of Iris Gateway: the HARDWARIO sensor node, the Node-RED gateway, and the Next.js cloud backend. It is the single source of truth for field names, types, and payload shapes.

For detailed endpoint signatures, validation, and error codes, see [backend_design.md](backend_design.md). For firmware and gateway flow logic, see [iot_design.md](iot_design.md).

## Identity model (read first)

Two distinct identifiers exist and must not be conflated:

| Term         | Format                  | Owner                  | Example         | Where it lives                                    |
| ------------ | ----------------------- | ---------------------- | --------------- | ------------------------------------------------- |
| Node `deviceId` | `^[a-z0-9-]{3,64}$`  | sensor node (HARDWARIO)| `node-01`       | every node→gateway payload, every cloud telemetry/alarm record |
| Gateway hardware id | `^[a-z0-9-]{3,64}$` | Raspberry Pi          | `iris-gw-001`   | `POST /api/gateway/register` only                |
| Gateway `gatewayId` | Mongo ObjectId hex (24) | cloud-assigned    | `651f2a1b3c4d5e6f7a8b9c0d` | every cloud request after registration |

In every cloud telemetry or alarm POST, the **gateway** identifies itself with `gatewayId` (the cloud-assigned ObjectId) and identifies the originating **sensor node** with `deviceId` (e.g. `node-01`). The gateway hardware id (`iris-gw-001`) appears only at registration.

## 1. Node → Gateway

Transport: radio (HARDWARIO 868 MHz) or USB CDC. JSON on the wire.

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

| Field            | Type    | Required | Notes                                          |
| ---------------- | ------- | -------- | ---------------------------------------------- |
| `deviceId`       | string  | yes      | sensor node identifier                         |
| `timestamp`      | string  | yes      | ISO 8601 UTC; if the node has no RTC, the gateway re-stamps on arrival and includes that fact in observability logs |
| `temperatureC`   | number  | yes      | Celsius, range −40 to +85                      |
| `accelG`         | number  | yes      | gravity-corrected magnitude in g, range 0 to 16 |
| `alarm`          | boolean | yes      | true when the accelerometer threshold is breached |
| `batteryVoltage` | number  | no       | volts, 0 to 5                                  |
| `transport`      | string  | yes      | `radio` or `usb`                               |

## 2. Gateway-side validation

Required fields: `deviceId`, `timestamp`, `temperatureC`, `accelG`, `alarm`.

Type rules:
- `temperatureC`, `accelG`, `batteryVoltage` must be numbers
- `alarm` must be boolean
- `timestamp` must parse as ISO 8601; if off by more than 5 minutes from gateway clock, the gateway re-stamps with local time and logs the skew with the original value
- `deviceId` must match `^[a-z0-9-]{3,64}$`

Invalid payloads are dropped and logged. They are not forwarded to the cloud.

## 3. Gateway-local MongoDB documents

### Collection `telemetry`

One document per aggregation window.

```json
{
  "deviceId": "node-01",
  "timestamp": "2026-04-19T08:30:00Z",
  "temperatureC": 24.7,
  "avgTemperatureC": 24.52,
  "accelG": 0.18,
  "batteryVoltage": 2.95,
  "transport": "radio",
  "type": "telemetry"
}
```

`avgTemperatureC` is the moving average over the last `aggregationWindow` samples (default 5) per `deviceId`.

### Collection `alarm`

```json
{
  "deviceId": "node-01",
  "timestamp": "2026-04-19T08:30:05Z",
  "accelG": 1.94,
  "temperatureC": 24.9,
  "batteryVoltage": 2.94,
  "transport": "radio",
  "type": "alarm",
  "priority": "high",
  "message": "Acceleration threshold exceeded"
}
```

(Code lives in `gateway/flows.json`. The Mongo collection name is `alarm` singular; verify against `flows.json` and align if needed.)

### Collection `securityEvent` (iteration 2)

```json
{
  "gatewayId": "iris-gw-001",
  "timestamp": "2026-04-19T08:30:00Z",
  "srcIp": "192.168.50.41",
  "dstIp": "203.0.113.7",
  "signatureId": 2014020,
  "severity": "warning",
  "category": "Suspicious Outbound Traffic",
  "summary": "ET TROJAN known C2 domain DNS lookup",
  "actionTaken": "logged"
}
```

### Collection `outbox`

Holds cloud requests pending delivery during a cloud outage.

```json
{
  "targetPath": "/api/alarm",
  "method": "POST",
  "payload": { "...": "..." },
  "enqueuedAt": "2026-04-19T08:30:05Z",
  "attempts": 0,
  "nextAttemptAt": "2026-04-19T08:30:15Z"
}
```

Documents are removed after successful delivery. Retry backoff: 15 s → 30 s → 60 s → 5 min cap. Maximum age 24 h (NFR6); older entries are logged and dropped.

## 4. Internal MQTT topics (within the gateway)

| Topic                              | Payload                     | Purpose                        |
| ---------------------------------- | --------------------------- | ------------------------------ |
| `iot-secure-sentinel/raw`          | validated node payload      | observability, optional sinks  |
| `iot-secure-sentinel/telemetry`    | aggregated telemetry doc    | local UI, downstream consumers |
| `iot-secure-sentinel/alarm`        | alarm doc                   | local UI, alerting             |
| `iot-secure-sentinel/security`     | IDS event (iteration 2)     | rule engine                    |
| `iot-secure-sentinel/firewall`     | firewall command (iter 2)   | iptables applier               |

Mosquitto requires authentication (`mosquitto_passwd`); the firewall topic is restricted by ACL to the rule engine and kill-switch publisher only.

## 5. Gateway → Cloud (HTTP REST + HMAC)

Transport: HTTPS, JSON, HMAC-SHA-256 signed headers with single-use nonce. Base URL from environment, e.g. `https://iris.example.app`.

### 5.0 Authentication headers

Every gateway request to a HMAC-protected endpoint includes:

```
X-Gateway-Id: 651f2a1b3c4d5e6f7a8b9c0d
X-Timestamp: 2026-04-19T08:30:05Z
X-Nonce: 4f8c7d2a-1e6b-4a9c-8d0f-3e7b1c5a9e2f
X-Signature: 3a7b1c5a9e2f0d8c6e4f2b0a8c6e4f2b0a8c6e4f2b0a8c6e4f2b0a8c6e4f2b0a
Content-Type: application/json
```

Canonical signing string (LF-separated, no trailing newline):
```
<METHOD>\n<PATH>\n<TIMESTAMP>\n<NONCE>\n<BODY_SHA256_HEX>
```

`BODY_SHA256_HEX` is the lowercase hex SHA-256 of the raw request body (empty string for GET).
`X-Signature` is the lowercase hex HMAC-SHA-256 of the canonical string using the gateway's HMAC secret.
`X-Nonce` is a UUIDv4; the cloud rejects repeats within a 10-minute window.

The HMAC secret is issued once by `POST /api/gateway/register` and stored on the gateway at `/etc/iris-gateway/credentials.json` (chmod 600, owned by a dedicated `iris-gateway` system user).

### 5.1 `POST /api/gateway/register`

No HMAC (gateway has no secret yet); requires a registration token.

Request body:

```json
{
  "deviceId": "iris-gw-001",
  "registrationToken": "rt_5f7a9c1e3d4b6a8c0e2f4d6b8a0c2e4f",
  "name": "Server room A",
  "location": "Building 4, floor -1",
  "firmwareVersion": "1.0.0"
}
```

Response `201`:

```json
{
  "gatewayId": "651f2a1b3c4d5e6f7a8b9c0d",
  "hmacSecret": "hs_5f7a9c1e3d4b6a8c0e2f4d6b8a0c2e4f6d8b0a2c",
  "config": {
    "accelThresholdG": 1.20,
    "telemetryIntervalSec": 60,
    "aggregationWindow": 5,
    "idsEnabled": false,
    "idsRules": []
  },
  "configVersion": 1
}
```

`hmacSecret` is returned exactly once. The gateway must persist it.

### 5.2 `POST /api/telemetry`

Request body (note: `deviceId` is the **sensor node** id, `gatewayId` is the cloud-assigned ObjectId):

```json
{
  "gatewayId": "651f2a1b3c4d5e6f7a8b9c0d",
  "deviceId": "node-01",
  "timestamp": "2026-04-19T08:30:00Z",
  "temperatureC": 24.7,
  "avgTemperatureC": 24.52,
  "accelG": 0.18,
  "batteryVoltage": 2.95,
  "transport": "radio"
}
```

Response `201` (or `200` on idempotent retry):

```json
{ "id": "651f3b2c4d5e6f7a8b9c0d1e" }
```

The cloud computes `idempotencyKey = sha256(gatewayId + deviceId + timestamp)` server-side. Retried POSTs from the gateway outbox return the existing record without inserting a duplicate.

### 5.3 `POST /api/alarm`

Request body:

```json
{
  "gatewayId": "651f2a1b3c4d5e6f7a8b9c0d",
  "deviceId": "node-01",
  "timestamp": "2026-04-19T08:30:05Z",
  "temperatureC": 24.9,
  "accelG": 1.94,
  "batteryVoltage": 2.94,
  "transport": "radio",
  "message": "Acceleration threshold exceeded"
}
```

Response `201`:

```json
{
  "id": "651f4c0d1e2f3a4b5c6d7e8f",
  "priority": "high",
  "state": "unresolved"
}
```

If the cloud's view of `gateway.armedState` is `disarmed` (which should not happen because the gateway suppresses alarms when locally disarmed; this is defense in depth):

```json
{
  "id": "651f4c0d1e2f3a4b5c6d7e8f",
  "priority": "low",
  "state": "unresolved",
  "warning": { "code": "gateway/disarmed", "message": "Gateway is disarmed; alarm stored as low priority." }
}
```

### 5.4 `GET /api/gateway/:id/config`

Response `200`:

```json
{
  "configVersion": 5,
  "config": {
    "accelThresholdG": 1.50,
    "telemetryIntervalSec": 30,
    "aggregationWindow": 5,
    "idsEnabled": true,
    "idsRules": [
      { "id": "rule-001", "signatureId": 2014020, "action": "block" }
    ]
  },
  "armedState": "armed"
}
```

### 5.5 `POST /api/security-event` (iteration 2)

Request body:

```json
{
  "gatewayId": "651f2a1b3c4d5e6f7a8b9c0d",
  "timestamp": "2026-04-19T08:30:00Z",
  "srcIp": "192.168.50.41",
  "dstIp": "203.0.113.7",
  "signatureId": 2014020,
  "severity": "warning",
  "category": "Suspicious Outbound Traffic",
  "summary": "ET TROJAN known C2 domain DNS lookup",
  "actionTaken": "logged"
}
```

Response `201`: `{ "id": "651f5d..." }`

### 5.6 `POST /api/firewall/rule` (iteration 2)

Request body:

```json
{
  "gatewayId": "651f2a1b3c4d5e6f7a8b9c0d",
  "target": "192.168.50.41",
  "action": "block",
  "reason": "securityEvent:651f5d...",
  "triggeredBy": "ids",
  "appliedAt": "2026-04-19T08:30:02Z",
  "expiresAt": null
}
```

Response `201`: `{ "id": "651f6e...", "state": "active" }`

## 6. Frontend → Cloud

The Next.js frontend calls the same Route Handlers from Server Components (initial render via `fetch`) and Client Components (TanStack Query polling). Authentication uses the Auth.js session cookie attached to same-origin requests.

Endpoints used by the UI:

- `GET /api/gateway` for the dashboard list
- `GET /api/gateway/:id` for the detail view
- `GET /api/telemetry?gatewayId=&from=&to=` for chart data
- `GET /api/alarm?state=unresolved` for the alarm list (polled every 5 s)
- `POST /api/alarm/:id/acknowledge` for the acknowledge flow
- `PATCH /api/gateway/:id/armed-state` for the arm/disarm toggle
- `PATCH /api/gateway/:id/config` for the settings form
- `POST /api/registration-token` for issuing tokens (admin only)

Full schemas and error codes are in [backend_design.md](backend_design.md).

## 7. Real-time UX (polling, no SSE)

The dashboard polls `GET /api/alarm?state=unresolved` every 5 s via TanStack Query. New alarms appear in the list and trigger a toast based on a client-side `id` delta. NFR5 (alarm visible within 5 s) is met without SSE, WebSocket, or any long-lived connection.

End-to-end latency budget under typical conditions: detection (50 ms) + radio (50 ms) + Node-RED (100 ms) + cloud HTTP (300 ms) + Mongo insert (50 ms) + next polling tick (0–5000 ms) = **0.5–5.5 seconds**.

## 8. Error envelope (cloud responses)

```json
{
  "error": {
    "code": "TIMESTAMP_IN_FUTURE",
    "message": "Timestamp is more than 5 minutes ahead of server time.",
    "details": { "submittedTimestamp": "2026-04-19T09:30:00Z" }
  }
}
```

Status codes and error codes are enumerated in [backend_design.md](backend_design.md). The gateway treats `2xx` as success and any `4xx`/`5xx` triggers the outbox retry path.

## 9. Backward compatibility notes

- `avgTemperatureC` is required on cloud telemetry records but is not part of the node payload; the gateway computes it
- the legacy `type` field (`telemetry | alarm`) exists only in local MongoDB documents to simplify collection-agnostic queries; it is not sent to the cloud
- `gatewayId` is added by the gateway on outbound cloud calls after registration; the node does not send it
- radio link MTU caps node payload at 256 bytes; new fields must fit inside this budget or move to the aggregation layer on the gateway
