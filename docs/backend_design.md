# Backend Design

## Scope

This document defines the cloud backend for Iris Gateway: REST endpoints (named after the uuApp commands in the team's submission), request and response schemas, the Mongoose persistence model, validation, authorization, and error responses. It is the source of truth for backend implementation. Use case IDs (UC-XXX) reference [business_requests.md](business_requests.md).

## Technology

- **Runtime:** Node.js 22 LTS (Bun 1.2+ in development)
- **Framework:** Next.js 16 with App Router; backend lives in `app/api/.../route.ts` Route Handlers
- **Database:** MongoDB 7 (MongoDB Atlas M0 free tier in production)
- **ODM:** Mongoose 8 with TypeScript interfaces
- **Validation:** Zod schemas (shared between Route Handlers and frontend forms)
- **Authentication:**
  - Auth.js v5 for users with credentials provider (Argon2id passwords); session in HTTP-only cookie
  - Bearer token (per-device API token) for the `DEVICE` role
- **Real-time UX:** TanStack Query polling (5-second interval) on the client
- **Background tasks:** Vercel Cron Jobs hitting `GET /api/cron/tick` every minute
- **Hosting:** Vercel (Next.js app) + MongoDB Atlas (database)

## Endpoint naming

The team's uuApp submission uses command-style names (e.g. `device/register`, `event/create`). The backend exposes these as REST endpoints under `/api/<command>` with the uuApp command name preserved verbatim. Example: command `device/register` → endpoint `POST /api/device/register`. This keeps the documentation aligned with the uuApp submission while implementing as a plain Next.js REST API.

## High-level architecture

```
+--------------------+        +-----------------------------+
|  React Frontend    |  fetch |  Next.js Route Handlers     |
|  (Server + Client  | -----> |  /app/api/<command>/route.ts|
|   Components,      |  poll  |  - Zod validation           |
|   TanStack Query)  |   5s   |  - Auth (Auth.js / token)   |
+--------------------+        |  - Service layer            |
        ^                     +--------------+--------------+
        | session cookie                     | Mongoose 8
        |                                    v
        |                     +-----------------------------+
        |                     |  MongoDB Atlas (M0)         |
        |                     |  collections:               |
        |                     |  - devices                  |
        |                     |  - sensors                  |
        |                     |  - events  (TTL 90 d)       |
        |                     |  - alarms                   |
        |                     |  - users                    |
        |                     |  - registrationTokens (TTL) |
        |                     |  - auditLog (TTL 1 y)       |
        |                     +-----------------------------+
                                    ^
                                    | HTTPS + Bearer token
                                    |
                              +-----------------+
                              |  IoT Gateway    |
                              |  + IoT Nodes    |
                              +-----------------+
```

## Project layout

```
cloud-app/
|-- src/
|   |-- app/
|   |   |-- (auth)/
|   |   |   |-- login/page.tsx
|   |   |-- (dashboard)/
|   |   |   |-- layout.tsx
|   |   |   |-- dashboard/page.tsx
|   |   |   |-- devices/page.tsx
|   |   |   |-- events/page.tsx
|   |   |   |-- alarms/page.tsx
|   |   |   |-- status/page.tsx
|   |   |-- api/
|   |   |   |-- auth/[...nextauth]/route.ts       # Auth.js handler
|   |   |   |-- device/
|   |   |   |   |-- register/route.ts
|   |   |   |   |-- heartbeat/route.ts
|   |   |   |   |-- list/route.ts
|   |   |   |   |-- update/route.ts
|   |   |   |-- sensor/
|   |   |   |   |-- register/route.ts
|   |   |   |   |-- list/route.ts
|   |   |   |-- event/
|   |   |   |   |-- create/route.ts
|   |   |   |   |-- list/route.ts
|   |   |   |-- alarm/
|   |   |   |   |-- list/route.ts
|   |   |   |   |-- acknowledge/route.ts
|   |   |   |-- dashboard/
|   |   |   |   |-- getOverview/route.ts
|   |   |   |-- firewall/
|   |   |   |   |-- applyRule/route.ts            # iter 2
|   |   |   |-- registration-token/
|   |   |   |   |-- issue/route.ts
|   |   |   |-- cron/tick/route.ts
|   |   |   |-- health/route.ts
|   |-- components/                               # see frontend_design.md
|   |-- lib/
|   |   |-- mongo.ts
|   |   |-- auth.ts
|   |   |-- device-auth.ts                        # Bearer token verify (DEVICE role)
|   |   |-- audit.ts
|   |   |-- validation/
|   |       |-- device.ts
|   |       |-- sensor.ts
|   |       |-- event.ts
|   |       |-- alarm.ts
|   |-- models/
|   |   |-- device.model.ts
|   |   |-- sensor.model.ts
|   |   |-- event.model.ts
|   |   |-- alarm.model.ts
|   |   |-- user.model.ts
|   |   |-- registration-token.model.ts
|   |   |-- audit-log.model.ts
|   |-- services/
|       |-- device-service.ts
|       |-- sensor-service.ts
|       |-- event-service.ts
|       |-- alarm-service.ts
|       |-- dashboard-service.ts
|-- public/
|-- next.config.ts
|-- vercel.json
|-- package.json
```

## Data model (Mongoose schemas)

### `device`

```ts
import { Schema, model } from "mongoose";

const deviceSchema = new Schema({
  name: { type: String, required: true, unique: true, maxlength: 120 },
  type: { type: String, enum: ["iotNode", "gateway"], required: true },
  status: { type: String, enum: ["online", "warning", "offline"], default: "offline" },
  location: { type: String, maxlength: 240 },
  ipAddress: String,                                 // mainly for gateways
  lastSeen: Date,
  apiTokenHash: { type: String, required: true },    // SHA-256 hex of the bearer token
  firmwareVersion: String,
  batteryVoltage: Number,                            // last reported value (for nodes)
  createdAt: { type: Date, default: Date.now },
});

deviceSchema.index({ status: 1 });
deviceSchema.index({ type: 1 });
export const Device = model("Device", deviceSchema);
```

### `sensor`

```ts
const sensorSchema = new Schema({
  deviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true, index: true },
  name: { type: String, required: true, maxlength: 120 },
  sensorType: {
    type: String,
    enum: ["pir", "magnetic", "smoke", "temperature", "accelerometer"],
    required: true,
  },
  unit: String,                                      // "C" for temperature, null for binary
  threshold: Number,                                 // optional alarm trigger threshold
  enabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const Sensor = model("Sensor", sensorSchema);
```

### `event`

```ts
const eventSchema = new Schema({
  deviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true },
  sensorId: { type: Schema.Types.ObjectId, ref: "Sensor", required: true },
  eventType: {
    type: String,
    enum: [
      "motionDetected",
      "doorOpened",
      "smokeDetected",
      "temperatureExceeded",
      "tamperDetected",
      "networkAnomaly",                              // iter 2 (Suricata signatures)
    ],
    required: true,
  },
  severity: { type: String, enum: ["low", "medium", "high", "critical"], required: true },
  value: Number,                                     // optional numeric or binary value
  message: { type: String, required: true, maxlength: 500 },
  timestamp: { type: Date, required: true },
  idempotencyKey: { type: String, required: true },  // sha256(deviceId|sensorId|timestamp|value)
});

eventSchema.index({ deviceId: 1, timestamp: -1 });
eventSchema.index({ sensorId: 1, timestamp: -1 });
eventSchema.index({ idempotencyKey: 1 }, { unique: true });
eventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });   // 90-day TTL
export const Event = model("Event", eventSchema);
```

### `alarm`

```ts
const alarmSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
  alarmType: { type: String, enum: ["intrusion", "fire", "technical", "tamper"], required: true },
  status: {
    type: String,
    enum: ["active", "acknowledged", "resolved", "falseAlarm"],
    default: "active",
  },
  acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
  acknowledgedAt: Date,
  acknowledgeNote: String,
  createdAt: { type: Date, default: Date.now },
  resolvedAt: Date,
});

alarmSchema.index({ status: 1, createdAt: -1 });
alarmSchema.index({ alarmType: 1 });
export const Alarm = model("Alarm", alarmSchema);
```

### `user`

```ts
const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  name: String,
  passwordHash: { type: String, required: true },     // Argon2id
  role: { type: String, enum: ["ADMIN", "OPERATOR", "USER"], default: "USER" },
  createdAt: { type: Date, default: Date.now },
});

export const User = model("User", userSchema);
```

`DEVICE` role is not a `User` document; it is implied by a valid bearer token resolving to a `Device` document.

### `registrationToken`

```ts
const registrationTokenSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },        // SHA-256 of the issued token
  issuedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
  issuedFor: { type: String, required: true, maxlength: 120 },      // human label
  expiresAt: { type: Date, required: true },                        // 24h after issue
  consumedAt: Date,
  consumedByDeviceId: { type: Schema.Types.ObjectId, ref: "Device" },
  createdAt: { type: Date, default: Date.now },
});

registrationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });    // TTL
export const RegistrationToken = model("RegistrationToken", registrationTokenSchema);
```

### `auditLog`

```ts
const auditLogSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: "User" },           // null for DEVICE / system
  actorKind: { type: String, enum: ["user", "device", "system"], required: true },
  action: { type: String, required: true },                         // e.g. "alarm.acknowledge"
  targetKind: { type: String, required: true },                     // e.g. "alarm"
  targetId: { type: String, required: true },
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});

auditLogSchema.index({ targetKind: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });      // 1y TTL
export const AuditLog = model("AuditLog", auditLogSchema);
```

## Endpoint catalog

All endpoints are JSON over HTTPS. Successful responses return `200` (or `201` for creation). Errors return a uniform envelope (see Error envelope section).

| Command                  | Method | Path                                | Profiles                     | UC      |
| ------------------------ | ------ | ----------------------------------- | ---------------------------- | ------- |
| `device/register`        | POST   | `/api/device/register`              | `ADMIN`, `DEVICE`            | UC-001  |
| `device/heartbeat`       | POST   | `/api/device/heartbeat`             | `DEVICE`                     | UC-002  |
| `device/list`            | GET    | `/api/device/list`                  | `ADMIN`, `OPERATOR`          | UC-007  |
| `device/update`          | POST   | `/api/device/update`                | `ADMIN`                      | UC-008  |
| `sensor/register`        | POST   | `/api/sensor/register`              | `ADMIN`                      | UC-007  |
| `sensor/list`            | GET    | `/api/sensor/list`                  | `ADMIN`, `OPERATOR`          | UC-007  |
| `event/create`           | POST   | `/api/event/create`                 | `DEVICE`                     | UC-003  |
| `event/list`             | GET    | `/api/event/list`                   | `ADMIN`, `OPERATOR`, `USER`  | UC-007  |
| `alarm/list`             | GET    | `/api/alarm/list`                   | `ADMIN`, `OPERATOR`, `USER`  | UC-006  |
| `alarm/acknowledge`      | POST   | `/api/alarm/acknowledge`            | `ADMIN`, `OPERATOR`          | UC-005  |
| `dashboard/getOverview`  | GET    | `/api/dashboard/getOverview`        | `ADMIN`, `OPERATOR`, `USER`  | UC-004  |
| `firewall/applyRule`     | POST   | `/api/firewall/applyRule`           | `DEVICE`                     | UC-010  |
| `registrationToken/issue`| POST   | `/api/registration-token/issue`     | `ADMIN`                      | UC-001  |
| `cron/tick`              | GET    | `/api/cron/tick`                    | (Cron secret)                | —       |
| `health`                 | GET    | `/api/health`                       | (public)                     | —       |

### `device/register` — `POST /api/device/register` (UC-001)

**Profiles:** unauthenticated; requires a valid registration token.

**Zod request schema (`RegisterDeviceInput`):**
```ts
export const RegisterDeviceInput = z.object({
  registrationToken: z.string().min(20),
  name: z.string().min(1).max(120),
  type: z.enum(["iotNode", "gateway"]),
  location: z.string().max(240).optional(),
  ipAddress: z.string().ip().optional(),
  firmwareVersion: z.string().optional(),
});
```

**Algorithm:**
1. Validate `dtoIn` with Zod; on failure return `invalidDtoIn`. On unknown keys return warning `unsupportedKeys` plus continue with the known subset.
2. Look up `registrationToken.tokenHash`; reject if not found, expired, or already consumed.
3. Check that no `device` with the same `name` exists; on conflict return `deviceAlreadyExists`.
4. Generate an API token (32 bytes from CSPRNG); store SHA-256 hash on the new `device.apiTokenHash`.
5. Mark the registration token as consumed (atomic `findOneAndUpdate` with `consumedAt: null` filter).
6. Set device `status: "online"`, `lastSeen: now`.
7. Write `auditLog` row.
8. Return the new device + the API token (plaintext, exactly once).

**Response 201:**
```json
{
  "device": {
    "id": "651f2a1b3c4d5e6f7a8b9c0d",
    "name": "Server room A gateway",
    "type": "gateway",
    "status": "online",
    "location": "Building 4, floor -1",
    "lastSeen": "2026-04-19T08:30:00Z"
  },
  "apiToken": "dt_5f7a9c1e3d4b6a8c0e2f4d6b8a0c2e4f6d8b0a2c"
}
```

**Errors:** `invalidDtoIn`, `unsupportedKeys` (warning), `invalidToken`, `deviceAlreadyExists`.

---

### `device/heartbeat` — `POST /api/device/heartbeat` (UC-002)

**Profiles:** `DEVICE` (bearer token).

**Request schema:**
```ts
export const HeartbeatInput = z.object({
  status: z.enum(["online", "warning"]).optional(),
  batteryVoltage: z.number().min(0).max(5).optional(),
});
```

**Algorithm:**
1. Validate `dtoIn`.
2. Resolve the device from the bearer token; if the token does not match any device → `unauthorized`.
3. Update `lastSeen: now` and any reported fields (`status`, `batteryVoltage`).
4. Return the updated heartbeat info.

**Response 200:**
```json
{
  "deviceId": "651f2a...",
  "status": "online",
  "lastSeen": "2026-04-19T08:30:00Z"
}
```

**Errors:** `invalidDtoIn`, `unsupportedKeys`, `unauthorized`, `deviceNotFound`.

---

### `device/list` — `GET /api/device/list` (UC-007)

**Profiles:** `ADMIN`, `OPERATOR`.

**Query params:** `?type=&status=&search=` (all optional).

**Response 200:**
```json
{
  "items": [
    {
      "id": "651f2a...",
      "name": "Server room A gateway",
      "type": "gateway",
      "status": "online",
      "location": "Building 4, floor -1",
      "lastSeen": "2026-04-19T08:29:55Z",
      "batteryVoltage": null
    }
  ]
}
```

---

### `device/update` — `POST /api/device/update` (UC-008)

**Profiles:** `ADMIN`.

**Request schema:**
```ts
export const UpdateDeviceInput = z.object({
  deviceId: z.string(),
  name: z.string().min(1).max(120).optional(),
  location: z.string().max(240).optional(),
  status: z.enum(["online", "warning", "offline"]).optional(),
});
```

**Side effects:** writes `auditLog`.

**Errors:** `invalidDtoIn`, `unsupportedKeys`, `deviceNotFound`, `forbidden`.

---

### `sensor/register` — `POST /api/sensor/register` (UC-007)

**Profiles:** `ADMIN`.

**Request schema:**
```ts
export const RegisterSensorInput = z.object({
  deviceId: z.string(),
  name: z.string().min(1).max(120),
  sensorType: z.enum(["pir", "magnetic", "smoke", "temperature", "accelerometer"]),
  unit: z.string().max(20).optional(),
  threshold: z.number().optional(),
  enabled: z.boolean().default(true),
});
```

**Response 201:** `{ "sensor": { "id": "...", ... } }`

---

### `sensor/list` — `GET /api/sensor/list`

**Profiles:** `ADMIN`, `OPERATOR`.

**Query params:** `?deviceId=&sensorType=&enabled=`

---

### `event/create` — `POST /api/event/create` (UC-003)

**Profiles:** `DEVICE` (bearer token).

**Request schema:**
```ts
export const CreateEventInput = z.object({
  deviceId: z.string(),
  sensorId: z.string(),
  eventType: z.enum([
    "motionDetected",
    "doorOpened",
    "smokeDetected",
    "temperatureExceeded",
    "tamperDetected",
    "networkAnomaly",
  ]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  value: z.number().optional(),
  message: z.string().min(1).max(500),
  timestamp: z.string().datetime(),
});
```

**Algorithm:**
1. Validate `dtoIn`.
2. Verify the bearer token resolves to a device with `DEVICE` role; if not → `unauthorized`.
3. Verify the referenced `deviceId` exists; verify `sensorId` exists on that device.
   - For MVP, the gateway authenticates with its own bearer token but is allowed to submit events for any node it relays (gateway acts as a trusted edge proxy). Each sensor node could alternatively register its own bearer token; the same endpoint accepts both flows.
4. Compute `idempotencyKey = sha256(deviceId|sensorId|timestamp|value|message)`. Insert the event with this key as a unique constraint; on collision return the existing record (idempotent retry).
5. Evaluate alarm rules:
   - if `severity === "critical"` → always create an alarm
   - if `eventType === "tamperDetected"` → alarm of type `tamper`
   - if `eventType === "smokeDetected"` → alarm of type `fire`
   - if `eventType` is `motionDetected | doorOpened` AND device has armed state (future iteration) → alarm of type `intrusion`
   - if `eventType === "networkAnomaly"` → alarm of type `technical`
6. If an alarm is created, link it via `alarm.eventId`.
7. Update `device.lastSeen`.

**Response 201:**
```json
{
  "event": { "id": "651f5c...", "eventType": "tamperDetected", "severity": "high", "timestamp": "..." },
  "alarmCreated": true,
  "alarmId": "651f6d..."
}
```

**Errors:** `invalidDtoIn`, `unsupportedKeys`, `unauthorized`, `deviceNotFound`, `sensorNotFound`, `timestampInFuture`.

---

### `event/list` — `GET /api/event/list` (UC-007)

**Profiles:** `ADMIN`, `OPERATOR`, `USER`.

**Query params:** `?deviceId=&sensorId=&eventType=&severity=&from=&to=&page=&pageSize=`

**Response 200:**
```json
{
  "items": [ { "id": "...", "eventType": "...", "severity": "...", "timestamp": "...", "message": "..." } ],
  "page": 0,
  "pageSize": 50,
  "total": 1234
}
```

---

### `alarm/list` — `GET /api/alarm/list` (UC-006)

**Profiles:** `ADMIN`, `OPERATOR`, `USER`.

**Query params:** `?status=&alarmType=&from=&to=&page=&pageSize=`

**Algorithm:**
1. Validate query params.
2. Build filter from criteria.
3. Load filtered alarms with `$lookup` to `event` and `device` (for `deviceName`, `eventType`).
4. Apply pagination, return item list and page info.

**Response 200:**
```json
{
  "items": [
    {
      "id": "651f6d...",
      "alarmType": "tamper",
      "status": "active",
      "createdAt": "2026-04-19T08:30:05Z",
      "event": {
        "id": "651f5c...",
        "eventType": "tamperDetected",
        "severity": "high",
        "value": 1.94,
        "message": "Acceleration threshold exceeded"
      },
      "device": { "id": "...", "name": "Server room A gateway", "location": "..." }
    }
  ],
  "page": 0,
  "pageSize": 50,
  "total": 3
}
```

---

### `alarm/acknowledge` — `POST /api/alarm/acknowledge` (UC-005)

**Profiles:** `ADMIN`, `OPERATOR`.

**Request schema:**
```ts
export const AcknowledgeAlarmInput = z.object({
  alarmId: z.string(),
  note: z.string().min(3).max(500).optional(),
});
```

**Algorithm:**
1. Validate `dtoIn`.
2. Verify alarm exists; if not → `alarmNotFound`.
3. Verify alarm status is `active`; if not → `invalidAlarmState`.
4. Update status to `acknowledged`, store `acknowledgedBy`, `acknowledgedAt`, `acknowledgeNote`.
5. Write `auditLog`.

**Response 200:**
```json
{
  "id": "651f6d...",
  "status": "acknowledged",
  "acknowledgedBy": "651e1a...",
  "acknowledgedAt": "2026-04-19T08:35:11Z"
}
```

**Errors:** `invalidDtoIn`, `unsupportedKeys`, `alarmNotFound`, `invalidAlarmState`, `forbidden`.

---

### `dashboard/getOverview` — `GET /api/dashboard/getOverview` (UC-004)

**Profiles:** `ADMIN`, `OPERATOR`, `USER`.

**Algorithm:**
1. Validate `dtoIn` (no body for GET).
2. Aggregate counts:
   - devices online / offline / warning
   - alarms active / acknowledged / resolved
   - events in the last 24 h
3. Load timestamp of the latest event.
4. Return assembled `dtoOut`.

**Response 200:**
```json
{
  "devices": { "online": 4, "offline": 1, "warning": 0, "total": 5 },
  "alarms": { "active": 2, "acknowledged": 7, "resolved": 124 },
  "events": { "last24h": 312, "latestAt": "2026-04-19T08:34:50Z" },
  "lastUpdated": "2026-04-19T08:35:00Z"
}
```

---

### `firewall/applyRule` — `POST /api/firewall/applyRule` (UC-010, iter 2)

**Profiles:** `DEVICE` (bearer token). Audit only — the gateway has applied the rule locally.

**Request schema:**
```ts
export const ApplyFirewallRuleInput = z.object({
  target: z.string(),                                  // IP or CIDR
  action: z.enum(["block", "allow"]),
  reason: z.string().min(1).max(240),
  triggeredBy: z.enum(["killSwitch", "ids", "manual"]),
  appliedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable().optional(),
});
```

**Response 201:** `{ "id": "651f7e...", "state": "active" }`

---

### `registrationToken/issue` — `POST /api/registration-token/issue`

**Profiles:** `ADMIN`.

**Request:** `{ "issuedFor": "iris-gw-005 / Building 7" }`

**Response 201:**
```json
{ "token": "rt_5f7a9c1e...", "expiresAt": "2026-04-20T08:30:00Z" }
```

`token` is returned exactly once; `tokenHash` (SHA-256) is stored.

---

### `cron/tick` — `GET /api/cron/tick`

**Profiles:** Cron secret (`Authorization: Bearer ${CRON_SECRET}`).

Performs minute-resolution housekeeping:
- mark devices with `lastSeen` older than `3 × heartbeat interval` (default 3 × 60 s) as `offline`
- close alarms whose linked event chain has been resolved
- expire registration tokens (TTL handles it; cron is a backup)

---

### `health` — `GET /api/health`

**Profiles:** public.

**Response 200:** `{ "status": "ok", "db": "ok", "version": "1.0.0" }`

## Authentication

### Users (Auth.js v5)

- Credentials provider with email + password
- Passwords hashed with **Argon2id** (memory cost 64 MiB, time cost 3, parallelism 1; OWASP 2026 baseline)
- Session stored as JWT in HTTP-only `__Secure-authjs.session-token` cookie
- Session payload includes `userId` and `role` (`ADMIN | OPERATOR | USER`)
- Middleware on `(dashboard)` routes redirects unauthenticated requests to `/login`
- Login rate limit: 10 attempts per 15 min per email (Mongo `loginAttempts` collection)

### Devices (Bearer token, `DEVICE` role)

Devices send:

```
Authorization: Bearer dt_5f7a9c1e...
```

The middleware:
1. Extracts the token, computes SHA-256.
2. Looks up `device.apiTokenHash`; constant-time compare via `crypto.timingSafeEqual`.
3. If match, attaches `req.device` and assigns `DEVICE` role for authorization.
4. Updates `device.lastSeen` (debounced — no more than once per 30 s per device).

The token is issued once at `device/register` and stored only as SHA-256 hash. Loss requires re-registration.

### Authorization (role matrix)

| Action                                    | ADMIN | OPERATOR | USER | DEVICE |
| ----------------------------------------- | ----- | -------- | ---- | ------ |
| View dashboard                            | yes   | yes      | yes  | no     |
| List devices / events / alarms            | yes   | yes      | yes (read) | no |
| Acknowledge alarm                         | yes   | yes      | no   | no     |
| Update device                             | yes   | no       | no   | no     |
| Register sensor                           | yes   | no       | no   | no     |
| Issue registration token                  | yes   | no       | no   | no     |
| Submit heartbeat / event / firewall rule  | no    | no       | no   | yes    |
| Register device (with valid token)        | yes (admin path) | no | no | yes (device path) |

Reusable `requireProfile(...profiles)` helper guards each Route Handler.

## Validation strategy

- Every Route Handler starts with `Schema.safeParse(await req.json())`. On failure return `invalidDtoIn` with the issue list.
- Unknown keys in the input produce a `unsupportedKeys` warning in the response (the request is not rejected; known keys are processed). This matches the team's uuApp validation conventions.
- Schemas live in `src/lib/validation/` and are imported by both Route Handlers and frontend forms (React Hook Form + `@hookform/resolvers/zod`).

## Error envelope

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

Successful responses may include warnings:
```json
{
  "device": { ... },
  "warning": { "code": "unsupportedKeys", "params": { "unsupportedKeyList": ["legacyField"] } }
}
```

| HTTP | Code                  | Meaning                                          |
| ---- | --------------------- | ------------------------------------------------ |
| 400  | `invalidDtoIn`        | Zod validation failed                            |
| 400  | `invalidAlarmState`   | alarm not in `active` state                      |
| 400  | `timestampInFuture`   | event timestamp more than 5 min ahead            |
| 401  | `unauthorized`        | missing or invalid auth (session, token, cron)   |
| 403  | `forbidden`           | role insufficient                                |
| 404  | `deviceNotFound`      | unknown device ID                                |
| 404  | `sensorNotFound`      | unknown sensor ID                                |
| 404  | `alarmNotFound`       | unknown alarm ID                                 |
| 409  | `deviceAlreadyExists` | device name taken                                |
| 409  | `invalidToken`        | registration token expired or already consumed   |
| 500  | `internalError`       | unexpected; details server-side only             |

| Warning code        | Meaning                                       |
| ------------------- | --------------------------------------------- |
| `unsupportedKeys`   | DtoIn contains keys outside the schema; ignored |

## Service layer responsibilities

| Service             | Concern                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `device-service`    | register, heartbeat, list, update, lastSeen bookkeeping                |
| `sensor-service`    | register, list, threshold management                                   |
| `event-service`     | create with idempotency, list with filters, alarm rule evaluation      |
| `alarm-service`     | list with `$lookup`, acknowledge with audit, status transitions        |
| `dashboard-service` | aggregate counts and latest timestamps for `dashboard/getOverview`     |
| `audit`             | helper to write `AuditLog` rows from any service                       |

Route Handlers never call Mongoose models directly. This keeps services unit-testable without HTTP.

## Real-time UX (no SSE, no WebSocket)

The dashboard achieves the NFR5 5-second visibility target via TanStack Query polling:

```ts
export function useActiveAlarms() {
  return useQuery({
    queryKey: ["alarm", "list", { status: "active" }],
    queryFn: () => api.alarm.list({ status: "active" }),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}
```

Toast on new alarm comes from a `useEffect` that compares the latest `id` against the previous render's value.

End-to-end latency budget under typical conditions: detection (50 ms) + radio (50 ms) + Node-RED (100 ms) + cloud HTTP (300 ms) + Mongo insert (50 ms) + next polling tick (0–5000 ms) = **0.5–5.5 seconds**.

## Background tasks

`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/tick", "schedule": "* * * * *" }
  ]
}
```

The handler authenticates via `Authorization: Bearer ${CRON_SECRET}` (Vercel injects this header automatically when configured).

## Observability

- Structured JSON logs via `pino`
- Per-request `traceId` (UUID)
- `GET /api/health` for external uptime monitoring
- Mongo slow-query log threshold 200 ms (dev only)
- `AuditLog` records who/when/what for sensitive mutations (config changes, acknowledgements, registration token issuance, role changes)

## Implementation milestones

| Milestone | Scope                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------- |
| M1        | Mongo connection, Device + Sensor + Event + Alarm models, `device/register`, `device/heartbeat`, `event/create` end-to-end |
| M2        | Auth.js login, session middleware, `device/list`, `event/list`, `alarm/list`, `dashboard/getOverview` for the dashboard |
| M3        | `alarm/acknowledge`, `device/update`, `sensor/register`, `auditLog` writes                         |
| M4        | `registrationToken/issue`, `cron/tick`, `health`, deploy to Vercel + MongoDB Atlas                  |
| M5        | Iteration 2: `firewall/applyRule`, networkAnomaly event flow                                       |

## Open questions

1. Push notifications (email) for alarms — add now via Resend, or stay polling-only for MVP?
2. Per-organization scoping — single tenant per deployment, or add `organizationId` to all models?
3. Aggregation strategy for long-range event queries — pre-compute hourly buckets via cron, or compute on read with `$bucket`?
