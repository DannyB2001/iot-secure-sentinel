# Backend Design

## Scope

This document defines the cloud backend for Iris Gateway: REST endpoints, request and response schemas, the persistence model, validation, authorization, and error responses. It is the source of truth for backend implementation. Use case IDs (UC-XXX) reference [business_requests.md](business_requests.md).

## Technology

- **Runtime:** Node.js 22 LTS (Bun 1.2+ in development)
- **Framework:** Next.js 16 with App Router; backend lives in `app/api/.../route.ts` Route Handlers
- **Database:** MongoDB 7 (MongoDB Atlas M0 free tier in production)
- **ODM:** Mongoose 8 with TypeScript interfaces
- **Validation:** Zod schemas (shared between Route Handlers and frontend forms)
- **Authentication:** Auth.js v5 for users; HMAC SHA-256 with single-use nonce for gateways
- **Real-time UX:** TanStack Query polling on the client (5-second interval). No SSE, no WebSocket
- **Background tasks:** Vercel Cron Jobs hitting `GET /api/cron/tick` every minute
- **Hosting:** Vercel (Next.js app) + MongoDB Atlas (database). Single-platform deploy

## High-level architecture

```
+--------------------+        +-----------------------------+
|  React Frontend    |  fetch |  Next.js Route Handlers     |
|  (Server + Client  | -----> |  /app/api/**/route.ts       |
|   Components,      |  poll  |  - Zod validation           |
|   TanStack Query   |   5s   |  - Auth (Auth.js / HMAC)    |
|   polling)         |        |  - Service layer            |
+--------------------+        +--------------+--------------+
                                              | Mongoose
                                              v
                              +-----------------------------+
                              |  MongoDB Atlas (M0)         |
                              |  collections:               |
                              |  - gateway                  |
                              |  - telemetry (TTL 30 d)     |
                              |  - alarm                    |
                              |  - securityEvent (TTL 90 d) |
                              |  - firewallRule             |
                              |  - user                     |
                              |  - registrationToken (TTL)  |
                              |  - auditLog                 |
                              +-----------------------------+
                                    ^
                                    | HTTPS + HMAC + nonce
                                    |
                              +-----------------+
                              |  Iris Gateway   |
                              |  (Node-RED HTTP)|
                              +-----------------+
```

The frontend and the gateway are both clients of the same Route Handlers. The gateway authenticates with HMAC; the user authenticates with a session cookie issued by Auth.js. Real-time UI updates come from 5 s polling, which fits NFR5 (alarm visible within 5 s) without long-lived connections.

## Project layout

```
cloud-app/
|-- src/
|   |-- app/
|   |   |-- (auth)/
|   |   |   |-- login/page.tsx
|   |   |-- (dashboard)/
|   |   |   |-- layout.tsx
|   |   |   |-- page.tsx                          # /
|   |   |   |-- gateway/[id]/page.tsx
|   |   |   |-- alarms/page.tsx
|   |   |   |-- settings/page.tsx                 # settings index
|   |   |   |-- settings/gateway/[id]/page.tsx
|   |   |   |-- settings/registration-tokens/page.tsx
|   |   |-- api/
|   |   |   |-- auth/[...nextauth]/route.ts       # Auth.js handler
|   |   |   |-- gateway/
|   |   |   |   |-- register/route.ts             # POST
|   |   |   |   |-- route.ts                      # GET list
|   |   |   |   |-- [id]/
|   |   |   |       |-- route.ts                  # GET state
|   |   |   |       |-- config/route.ts           # GET (HMAC), PATCH (session)
|   |   |   |       |-- armed-state/route.ts      # PATCH
|   |   |   |-- telemetry/route.ts                # POST (HMAC), GET (session)
|   |   |   |-- alarm/
|   |   |   |   |-- route.ts                      # POST (HMAC), GET (session)
|   |   |   |   |-- [id]/acknowledge/route.ts     # POST
|   |   |   |-- security-event/route.ts           # POST (HMAC, iter 2)
|   |   |   |-- firewall/rule/route.ts            # POST (HMAC, iter 2)
|   |   |   |-- registration-token/route.ts       # POST (admin)
|   |   |   |-- cron/tick/route.ts                # GET, called by Vercel Cron
|   |   |   |-- health/route.ts                   # GET, public
|   |   |-- layout.tsx
|   |   |-- globals.css
|   |-- components/
|   |   |-- ui/                                   # shadcn primitives (vendored)
|   |   |-- gateway-card.tsx
|   |   |-- alarm-list.tsx
|   |   |-- ...
|   |-- lib/
|   |   |-- mongo.ts                              # Mongoose connection singleton
|   |   |-- auth.ts                               # Auth.js config
|   |   |-- hmac.ts                               # HMAC verify with nonce
|   |   |-- audit.ts                              # audit log helper
|   |   |-- validation/
|   |       |-- gateway.ts                        # Zod schemas
|   |       |-- telemetry.ts
|   |       |-- alarm.ts
|   |-- models/
|   |   |-- gateway.model.ts                      # Mongoose schemas
|   |   |-- telemetry.model.ts
|   |   |-- alarm.model.ts
|   |   |-- security-event.model.ts
|   |   |-- firewall-rule.model.ts
|   |   |-- registration-token.model.ts
|   |   |-- user.model.ts
|   |   |-- audit-log.model.ts
|   |-- services/
|       |-- gateway-service.ts
|       |-- telemetry-service.ts
|       |-- alarm-service.ts
|-- public/
|-- next.config.ts
|-- vercel.json                                   # Cron schedule
|-- package.json
```

Route Handlers stay thin: parse, validate, call a service. Services hold the business logic and use Mongoose models directly.

## Data model (Mongoose schemas)

### `gateway`

```ts
import { Schema, model, type InferSchemaType } from "mongoose";

const gatewaySchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true, match: /^[a-z0-9-]{3,64}$/ },
    name: { type: String, required: true, maxlength: 120 },
    location: { type: String, maxlength: 240 },
    state: { type: String, enum: ["unregistered", "active", "inactive"], default: "active" },
    armedState: { type: String, enum: ["armed", "disarmed"], default: "armed" },
    config: {
      accelThresholdG: { type: Number, default: 1.20 },
      telemetryIntervalSec: { type: Number, default: 60 },
      aggregationWindow: { type: Number, default: 5 },
      idsEnabled: { type: Boolean, default: false },
      idsRules: [{ id: String, signatureId: Number, action: { type: String, enum: ["block", "allow"] } }],
    },
    configVersion: { type: Number, default: 1 },
    hmacSecretHash: { type: String, required: true },         // SHA-256 hex of the issued secret
    firmwareVersion: String,
    lastSeenAt: Date,
    lastTemperatureC: Number,                                  // denormalized from latest telemetry
  },
  { timestamps: true }
);

gatewaySchema.index({ state: 1 });
export const Gateway = model("Gateway", gatewaySchema);
export type GatewayDoc = InferSchemaType<typeof gatewaySchema>;
```

`state` is **never** persisted as `unregistered` for a gateway in the database; that value is reserved for the response of an unauthenticated probe. Created gateways start as `active`. The Mongoose default is `active`.

### `telemetry`

```ts
const telemetrySchema = new Schema({
  gatewayId: { type: Schema.Types.ObjectId, ref: "Gateway", required: true },
  deviceId: { type: String, required: true },                  // sensor node id (e.g. "node-01"), NOT gateway hardware id
  timestamp: { type: Date, required: true },
  temperatureC: { type: Number, required: true, min: -40, max: 85 },
  avgTemperatureC: { type: Number, required: true, min: -40, max: 85 },
  accelG: { type: Number, required: true, min: 0, max: 16 },
  batteryVoltage: { type: Number, min: 0, max: 5 },
  transport: { type: String, enum: ["radio", "usb"], required: true },
  idempotencyKey: { type: String, required: true },            // sha256(gatewayId + deviceId + timestamp)
});

telemetrySchema.index({ gatewayId: 1, timestamp: -1 });
telemetrySchema.index({ idempotencyKey: 1 }, { unique: true });
telemetrySchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });   // 30-day TTL
export const Telemetry = model("Telemetry", telemetrySchema);
```

The `idempotencyKey` makes retried POSTs from the gateway outbox a no-op rather than duplicates.

### `alarm`

```ts
const alarmSchema = new Schema({
  gatewayId: { type: Schema.Types.ObjectId, ref: "Gateway", required: true },
  deviceId: { type: String, required: true },                  // sensor node id
  timestamp: { type: Date, required: true },
  accelG: { type: Number, required: true, min: 0, max: 16 },
  temperatureC: { type: Number, min: -40, max: 85 },
  batteryVoltage: { type: Number },
  transport: { type: String, enum: ["radio", "usb"], required: true },
  priority: { type: String, enum: ["low", "medium", "high"], default: "high" },
  message: { type: String, required: true, maxlength: 500 },
  state: { type: String, enum: ["unresolved", "acknowledged"], default: "unresolved" },
  acknowledgedById: { type: Schema.Types.ObjectId, ref: "User" },
  acknowledgedAt: Date,
  acknowledgeNote: String,
  idempotencyKey: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

alarmSchema.index({ gatewayId: 1, state: 1, timestamp: -1 });
alarmSchema.index({ idempotencyKey: 1 }, { unique: true });
export const Alarm = model("Alarm", alarmSchema);
```

No TTL on alarms; kept for audit indefinitely.

### `securityEvent` (iteration 2)

```ts
const securityEventSchema = new Schema({
  gatewayId: { type: Schema.Types.ObjectId, ref: "Gateway", required: true },
  timestamp: { type: Date, required: true },
  srcIp: { type: String, required: true },
  dstIp: String,
  signatureId: { type: Number, required: true },
  severity: { type: String, enum: ["info", "warning", "critical"], required: true },
  category: { type: String, required: true },
  summary: { type: String, required: true },
  actionTaken: { type: String, enum: ["none", "logged", "blocked"], required: true },
});

securityEventSchema.index({ gatewayId: 1, timestamp: -1 });
securityEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });   // 90-day TTL
export const SecurityEvent = model("SecurityEvent", securityEventSchema);
```

### `firewallRule` (iteration 2)

```ts
const firewallRuleSchema = new Schema({
  gatewayId: { type: Schema.Types.ObjectId, ref: "Gateway", required: true },
  target: { type: String, required: true },
  action: { type: String, enum: ["block", "allow"], required: true },
  reason: { type: String, required: true },
  triggeredBy: { type: String, enum: ["killSwitch", "ids", "manual"], required: true },
  triggeredById: { type: Schema.Types.ObjectId, ref: "User" },   // null for killSwitch and ids
  appliedAt: { type: Date, required: true },
  expiresAt: Date,
  state: { type: String, enum: ["active", "reverted"], default: "active" },
});

firewallRuleSchema.index({ gatewayId: 1, state: 1 });
export const FirewallRule = model("FirewallRule", firewallRuleSchema);
```

### `registrationToken`

```ts
const registrationTokenSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },   // SHA-256 of the issued token
  issuedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
  issuedFor: { type: String, required: true, maxlength: 120 }, // human-readable label
  consumedAt: Date,
  consumedByGatewayId: { type: Schema.Types.ObjectId, ref: "Gateway" },
  expiresAt: { type: Date, required: true },                   // 24 h after issue
}, { timestamps: { createdAt: true, updatedAt: false } });

registrationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });    // TTL
export const RegistrationToken = model("RegistrationToken", registrationTokenSchema);
```

### `user`

```ts
const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  name: String,
  passwordHash: { type: String, required: true },              // Argon2id
  role: { type: String, enum: ["admin", "operator", "user", "reader"], default: "reader" },
}, { timestamps: true });

export const User = model("User", userSchema);
```

Default role is `reader` (least privilege). An admin elevates accounts manually after invitation.

### `auditLog`

Captures who/when/what for sensitive mutations: config changes, armed-state changes, alarm acknowledgements, registration token issuance, role changes.

```ts
const auditLogSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: "User" },       // null for system actors
  actorKind: { type: String, enum: ["user", "gateway", "system"], required: true },
  action: { type: String, required: true },                    // e.g. "gateway.config.update"
  targetKind: { type: String, required: true },                // e.g. "gateway"
  targetId: { type: String, required: true },
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
}, { timestamps: { createdAt: true, updatedAt: false } });

auditLogSchema.index({ targetKind: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });      // 1-year TTL
export const AuditLog = model("AuditLog", auditLogSchema);
```

## Endpoint catalog (REST)

All endpoints are JSON over HTTPS. Successful responses return `200` (or `201` for creation). Errors return a uniform envelope (see Error envelope section).

| Method | Path                                          | Auth         | UC      |
| ------ | --------------------------------------------- | ------------ | ------- |
| POST   | `/api/gateway/register`                       | token        | UC-001  |
| GET    | `/api/gateway`                                | session      | UC-004  |
| GET    | `/api/gateway/:id`                            | session      | UC-004  |
| GET    | `/api/gateway/:id/config`                     | HMAC         | UC-006  |
| PATCH  | `/api/gateway/:id/config`                     | session+role | UC-006  |
| PATCH  | `/api/gateway/:id/armed-state`                | session+role | UC-008  |
| POST   | `/api/telemetry`                              | HMAC         | UC-002  |
| GET    | `/api/telemetry`                              | session      | UC-004  |
| POST   | `/api/alarm`                                  | HMAC         | UC-003  |
| GET    | `/api/alarm`                                  | session      | UC-004  |
| POST   | `/api/alarm/:id/acknowledge`                  | session+role | UC-005  |
| POST   | `/api/security-event`                         | HMAC         | UC-009  |
| POST   | `/api/firewall/rule`                          | HMAC         | UC-010  |
| POST   | `/api/registration-token`                     | session+role | UC-001  |
| GET    | `/api/cron/tick`                              | cron secret  | —       |
| GET    | `/api/health`                                 | public       | —       |

### POST `/api/gateway/register` (UC-001)

**Auth:** unauthenticated; requires a valid registration token issued out of band.

**Zod request schema:**
```ts
export const RegisterGatewayInput = z.object({
  deviceId: z.string().regex(/^[a-z0-9-]{3,64}$/),             // gateway hardware id (e.g. "iris-gw-001")
  registrationToken: z.string().min(20),
  name: z.string().min(1).max(120),
  location: z.string().max(240).optional(),
  firmwareVersion: z.string().optional(),
});
```

**Response 201:**
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

`hmacSecret` is returned exactly once. The backend stores `SHA-256(hmacSecret)` in `gateway.hmacSecretHash`. Comparison at verify time uses `crypto.timingSafeEqual` on the SHA-256 digests (fast, constant-time, appropriate for high-entropy machine secrets).

**Errors:** `INVALID_DTO`, `INVALID_TOKEN`, `GATEWAY_ALREADY_EXISTS`.

---

### GET `/api/gateway/:id/config` (UC-006)

**Auth:** HMAC (gateway).

**Response 200:**
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

**Errors:** `GATEWAY_NOT_FOUND`, `UNAUTHORIZED`.

---

### PATCH `/api/gateway/:id/config` (UC-006)

**Auth:** session + role `admin` or `operator`.

**Request schema:**
```ts
export const UpdateGatewayConfigInput = z.object({
  accelThresholdG: z.number().min(0.1).max(5.0),
  telemetryIntervalSec: z.number().int().min(10).max(3600),
  aggregationWindow: z.number().int().min(1).max(20),
  idsEnabled: z.boolean(),
  idsRules: z.array(z.object({
    id: z.string(),
    signatureId: z.number().int(),
    action: z.enum(["block", "allow"]),
  })),
});
```

**Response 200:** `{ "configVersion": 6 }`

**Side effects:** writes an `AuditLog` row with `before` and `after` config snapshots and the acting user.

**Errors:** `INVALID_DTO`, `INVALID_THRESHOLD`, `GATEWAY_NOT_FOUND`, `FORBIDDEN`.

---

### PATCH `/api/gateway/:id/armed-state` (UC-008)

**Auth:** session + role `admin`, `operator`, or `user`.

**Request schema:**
```ts
export const SetArmedStateInput = z.object({
  armedState: z.enum(["armed", "disarmed"]),
});
```

**Response 200:**
```json
{ "armedState": "disarmed", "changedAt": "2026-04-19T08:30:00Z" }
```

**Side effects:** writes an `AuditLog` row.

---

### GET `/api/gateway/:id` (UC-004)

**Auth:** session (any role).

**Response 200:**
```json
{
  "id": "651f2a1b3c4d5e6f7a8b9c0d",
  "deviceId": "iris-gw-001",
  "name": "Server room A",
  "location": "Building 4, floor -1",
  "state": "active",
  "armedState": "armed",
  "lastSeenAt": "2026-04-19T08:29:55Z",
  "lastTemperatureC": 22.4,
  "configVersion": 6
}
```

`lastTemperatureC` is denormalized on the `Gateway` document and updated on every telemetry insert.

---

### GET `/api/gateway` (UC-004)

**Auth:** session (any role).

**Query params:** `?state=active&search=server` (both optional).

**Response 200:**
```json
{
  "items": [
    {
      "id": "651f2a1b3c4d5e6f7a8b9c0d",
      "deviceId": "iris-gw-001",
      "name": "Server room A",
      "state": "active",
      "armedState": "armed",
      "lastSeenAt": "2026-04-19T08:29:55Z",
      "lastTemperatureC": 22.4
    }
  ]
}
```

---

### POST `/api/telemetry` (UC-002)

**Auth:** HMAC (gateway).

**Request schema:**
```ts
export const CreateTelemetryInput = z.object({
  gatewayId: z.string(),                                       // Mongo ObjectId hex
  deviceId: z.string(),                                        // sensor node id, e.g. "node-01"
  timestamp: z.string().datetime(),
  temperatureC: z.number().min(-40).max(85),
  avgTemperatureC: z.number().min(-40).max(85),
  accelG: z.number().min(0).max(16),
  batteryVoltage: z.number().min(0).max(5).optional(),
  transport: z.enum(["radio", "usb"]),
});
```

The handler computes `idempotencyKey = sha256(gatewayId + deviceId + timestamp)` server-side and uses it as the unique key on insert. Duplicate inserts return `200 OK` with the existing record id (idempotent retry).

**Response 201 (or 200 on idempotent retry):**
```json
{ "id": "651f3b2c4d5e6f7a8b9c0d1e" }
```

**Side effects:**
- updates `gateway.lastSeenAt`
- updates `gateway.lastTemperatureC`
- flips `gateway.state` to `active` if previously `inactive`

**Errors:** `INVALID_DTO`, `GATEWAY_NOT_FOUND`, `TIMESTAMP_IN_FUTURE` (if more than 5 min ahead).

---

### GET `/api/telemetry` (UC-004)

**Auth:** session.

**Query params:** `?gatewayId=...&from=2026-04-18T00:00Z&to=2026-04-19T00:00Z&page=0&pageSize=100`

**Response 200:**
```json
{
  "items": [
    {
      "id": "651f3b2c...",
      "timestamp": "2026-04-19T08:30:00Z",
      "temperatureC": 24.7,
      "avgTemperatureC": 24.52,
      "accelG": 0.18
    }
  ],
  "page": 0,
  "pageSize": 100,
  "total": 1440
}
```

For ranges over 24 hours the service returns hourly aggregates computed via Mongo aggregation pipeline (`$bucket` on `timestamp` with `$avg` on `temperatureC`). For ranges under 24 hours the raw documents are returned.

---

### POST `/api/alarm` (UC-003)

**Auth:** HMAC (gateway).

**Request schema:**
```ts
export const CreateAlarmInput = z.object({
  gatewayId: z.string(),
  deviceId: z.string(),                                        // sensor node id
  timestamp: z.string().datetime(),
  accelG: z.number().min(0).max(16),
  temperatureC: z.number().min(-40).max(85).optional(),
  batteryVoltage: z.number().min(0).max(5).optional(),
  transport: z.enum(["radio", "usb"]),
  message: z.string().min(1).max(500),
});
```

`idempotencyKey` computed as for telemetry.

**Response 201 (or 200 on idempotent retry):**
```json
{ "id": "651f4c...", "priority": "high", "state": "unresolved" }
```

**Side effects:**
- if `gateway.armedState === 'disarmed'` (defense in depth; the gateway should already have suppressed the alarm), the alarm is stored with `priority: low` and the response includes a warning code `gateway/disarmed` in the body
- otherwise the alarm is stored with `priority: high`

The dashboard surfaces new alarms via 5-second polling on `GET /api/alarm?state=unresolved`. No push protocol.

---

### GET `/api/alarm` (UC-004)

**Auth:** session.

**Query params:** `?gatewayId=...&state=unresolved&from=...&page=0&pageSize=50`

**Response 200:**
```json
{
  "items": [
    {
      "id": "651f4c...",
      "gatewayId": "651f2a...",
      "gatewayName": "Server room A",
      "deviceId": "node-01",
      "timestamp": "2026-04-19T08:30:05Z",
      "accelG": 1.94,
      "priority": "high",
      "state": "unresolved",
      "message": "Acceleration threshold exceeded"
    }
  ],
  "page": 0,
  "pageSize": 50,
  "total": 3
}
```

---

### POST `/api/alarm/:id/acknowledge` (UC-005)

**Auth:** session + role `admin`, `operator`, or `user`.

**Request schema:**
```ts
export const AcknowledgeAlarmInput = z.object({
  note: z.string().min(3).max(500),
});
```

**Response 200:**
```json
{
  "id": "651f4c...",
  "state": "acknowledged",
  "acknowledgedById": "651e1a...",
  "acknowledgedAt": "2026-04-19T08:35:11Z"
}
```

**Side effects:** writes an `AuditLog` row.

**Errors:** `INVALID_DTO`, `ALARM_NOT_FOUND`, `INVALID_STATE`.

---

### POST `/api/security-event` (UC-009, iteration 2)

**Auth:** HMAC.

**Request schema:**
```ts
export const CreateSecurityEventInput = z.object({
  gatewayId: z.string(),
  timestamp: z.string().datetime(),
  srcIp: z.string().ip(),
  dstIp: z.string().ip().optional(),
  signatureId: z.number().int(),
  severity: z.enum(["info", "warning", "critical"]),
  category: z.string().min(1).max(120),
  summary: z.string().min(1).max(500),
  actionTaken: z.enum(["none", "logged", "blocked"]),
});
```

**Response 201:** `{ "id": "651f5d..." }`

---

### POST `/api/firewall/rule` (UC-010, iteration 2)

**Auth:** HMAC. Audit only; the gateway has already applied the rule locally.

**Request schema:**
```ts
export const CreateFirewallRuleInput = z.object({
  gatewayId: z.string(),
  target: z.string(),                                          // IP or CIDR
  action: z.enum(["block", "allow"]),
  reason: z.string().min(1).max(240),
  triggeredBy: z.enum(["killSwitch", "ids", "manual"]),
  appliedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable().optional(),
});
```

**Response 201:** `{ "id": "651f6e...", "state": "active" }`

---

### POST `/api/registration-token` (UC-001 prerequisite)

**Auth:** session + role `admin`.

**Request schema:**
```ts
export const IssueRegistrationTokenInput = z.object({
  issuedFor: z.string().min(1).max(120),                       // human-readable label, e.g. "iris-gw-005 / Building 7"
});
```

**Response 201:**
```json
{
  "token": "rt_5f7a9c1e3d4b6a8c0e2f4d6b8a0c2e4f",
  "expiresAt": "2026-04-20T08:30:00Z"
}
```

`token` is returned once. The backend stores `SHA-256(token)` in `registrationToken.tokenHash`. Audit log records the issuer.

---

### GET `/api/cron/tick`

**Auth:** `Authorization: Bearer ${process.env.CRON_SECRET}` header. Vercel Cron sets this automatically when configured via `vercel.json`.

Performs minute-resolution housekeeping:
- mark gateways with `lastSeenAt` older than `3 × telemetryIntervalSec` as `inactive`
- revert `firewallRule` rows past their `expiresAt` (set state to `reverted`)
- expire registration tokens (TTL index handles this; the cron is a backup pass)

**Response 200:** `{ "ranAt": "2026-04-19T08:31:00Z", "actions": { "gatewaysInactive": 0, "firewallReverted": 0, "tokensExpired": 0 } }`

---

### GET `/api/health`

**Auth:** public (no auth, intended for uptime checks).

**Response 200:**
```json
{ "status": "ok", "db": "ok", "version": "1.0.0" }
```

The Mongoose connection state is checked; `db` returns `error` if not connected.

## Authentication

### Users (Auth.js v5)

- Credentials provider with email + password
- Passwords hashed with **Argon2id** (`@node-rs/argon2`) at memory cost 64 MB, time cost 3, parallelism 1 (OWASP 2026 baseline)
- Session stored as JWT in HTTP-only cookie `__Secure-authjs.session-token` (Auth.js v5 default in production)
- Session payload includes `userId` and `role`
- Middleware on `(dashboard)` routes redirects unauthenticated requests to `/login`
- Login rate limit: 10 attempts per 15 min per email (in-memory LRU; documented as MVP-grade)
- No password reset path in MVP; admin must reset via DB

### Role matrix

| Action                                  | admin | operator | user | reader |
| --------------------------------------- | ----- | -------- | ---- | ------ |
| View dashboard                          | yes   | yes      | yes  | yes    |
| Acknowledge alarm                       | yes   | yes      | yes  | no     |
| Toggle armed state                      | yes   | yes      | yes  | no     |
| Edit gateway config                     | yes   | yes      | no   | no     |
| Issue registration token                | yes   | no       | no   | no     |
| Change user roles                       | yes   | no       | no   | no     |

A reusable `requireRole(...roles)` helper guards each Route Handler; the same matrix is mirrored in [frontend_design.md](frontend_design.md) for UI rendering.

### Gateways (HMAC SHA-256 with nonce)

Every gateway request to HMAC-protected endpoints carries:

```
X-Gateway-Id: 651f2a...
X-Timestamp: 2026-04-19T08:30:05Z
X-Nonce: 4f8c7d2a-1e6b-4a9c-8d0f-3e7b1c5a9e2f                  (UUIDv4, single-use)
X-Signature: <hex>                                              (lowercase hex)
```

Canonical signing string (LF-separated, no trailing newline):
```
<METHOD>\n<PATH>\n<TIMESTAMP>\n<NONCE>\n<BODY_SHA256_HEX>
```

`BODY_SHA256_HEX` is the lowercase hex SHA-256 of the raw request body (empty string for GET).

The middleware verifies in this order:
1. `X-Timestamp` is within ±5 minutes of server time → else `UNAUTHORIZED`
2. `X-Nonce` has not been seen in the last 10 minutes (in-memory LRU cache, fallback to `nonce_seen` collection with TTL) → else `UNAUTHORIZED`
3. `gatewayId` exists and is `state: active` → else `UNAUTHORIZED`
4. Recompute the signature, compare with `crypto.timingSafeEqual` against `gateway.hmacSecretHash` → else `UNAUTHORIZED`

Why SHA-256 and not Argon2id for the gateway secret: the secret is high-entropy (32 bytes from CSPRNG), so Argon2 stretching adds no security but adds 50–200 ms CPU per request. SHA-256 + constant-time compare is the right primitive.

## Validation strategy

- Every Route Handler starts with `Schema.safeParse(await req.json())`. On failure, return `400 INVALID_DTO` with the issue list.
- Schemas live in `src/lib/validation/` and are imported by both Route Handlers and frontend forms (React Hook Form + `@hookform/resolvers/zod`).
- Mongoose schemas back up Zod with the same constraints (enum, min, max, required) so any path that bypasses validation still fails closed.

## Error envelope

All error responses share one shape:

```json
{
  "error": {
    "code": "TIMESTAMP_IN_FUTURE",
    "message": "Timestamp is more than 5 minutes ahead of server time.",
    "details": { "submittedTimestamp": "2026-04-19T09:30:00Z" }
  }
}
```

| HTTP | Code                     | Meaning                                          |
| ---- | ------------------------ | ------------------------------------------------ |
| 400  | `INVALID_DTO`            | Zod validation failed                            |
| 400  | `INVALID_THRESHOLD`      | threshold out of allowed range                   |
| 400  | `INVALID_STATE`          | state transition not allowed                     |
| 400  | `TIMESTAMP_IN_FUTURE`    | clock skew                                       |
| 401  | `UNAUTHORIZED`           | missing or invalid auth (HMAC, session, nonce)   |
| 403  | `FORBIDDEN`              | role insufficient                                |
| 404  | `GATEWAY_NOT_FOUND`      | unknown gateway ID                               |
| 404  | `ALARM_NOT_FOUND`        | unknown alarm ID                                 |
| 409  | `GATEWAY_ALREADY_EXISTS` | deviceId taken                                   |
| 409  | `INVALID_TOKEN`          | registration token expired or already consumed   |
| 500  | `INTERNAL_ERROR`         | unexpected; details logged server-side only      |

Successful responses may include a `warning` field for non-fatal anomalies:

```json
{
  "id": "651f4c...",
  "priority": "low",
  "state": "unresolved",
  "warning": { "code": "gateway/disarmed", "message": "Gateway is disarmed; alarm stored as low priority." }
}
```

## Service layer responsibilities

| Service              | Concern                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `gateway-service`    | register, fetch, update config, set armed state, lastSeenAt update     |
| `telemetry-service`  | insert with idempotency, list with optional aggregation                |
| `alarm-service`      | create with idempotency + armed-state defense, list, acknowledge       |
| `audit`              | helper to write `AuditLog` rows from any service                       |

Route Handlers never call Mongoose models directly. This makes services unit-testable without HTTP.

## Real-time UX (no SSE, no WebSocket)

The dashboard achieves the NFR5 5-second alarm visibility target via TanStack Query polling:

```ts
// hooks/use-unresolved-alarms.ts
export function useUnresolvedAlarms() {
  return useQuery({
    queryKey: ["alarm", "list", { state: "unresolved" }],
    queryFn: () => api.alarm.list({ state: "unresolved" }),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}
```

Toast on new alarm comes from a `useEffect` that compares the latest `id` against the previous render's value. No EventSource, no Postgres LISTEN, no separate streaming service.

End-to-end latency budget under typical conditions: gateway detection (50 ms) + radio (50 ms) + Node-RED + cloud HTTP (300 ms) + Mongo insert (50 ms) + next polling tick (0–5000 ms) = **0.5–5.5 seconds**. Fits the 5 s NFR with margin in the average case.

## Background tasks

Vercel Cron entries in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/tick", "schedule": "* * * * *" }
  ]
}
```

The cron handler performs the housekeeping listed under `GET /api/cron/tick`. No long-lived process.

## Observability

- Structured JSON logs via `pino` (to stdout, picked up by Vercel log drains)
- Per-request `traceId` (UUID) attached to logs via `next-logger`
- `GET /api/health` for external uptime monitoring (UptimeRobot, Better Stack)
- Mongo slow-query log threshold 200 ms (`mongoose.set('debug', ...)` in dev only)

## Implementation milestones

| Milestone | Scope                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------- |
| M1        | Mongo connection, Gateway/Telemetry/Alarm models, `POST /api/gateway/register`, `POST /api/telemetry`, `POST /api/alarm` end-to-end against a local Node-RED flow |
| M2        | Auth.js login, session middleware, `/api/gateway`, `GET /api/telemetry`, `GET /api/alarm` with polling-friendly responses |
| M3        | `POST /api/alarm/:id/acknowledge`, `PATCH /api/gateway/:id/armed-state`, `PATCH /api/gateway/:id/config`, `AuditLog` writes |
| M4        | `POST /api/registration-token`, `GET /api/cron/tick`, `GET /api/health`, deploy to Vercel + MongoDB Atlas |
| M5        | Iteration 2: `POST /api/security-event`, `POST /api/firewall/rule`                                 |

## Open questions

1. Push notifications (email) for alarms: add now via Resend, or stay polling-only for MVP?
2. Per-organization scoping: single tenant per deployment, or add `organizationId` to all models?
3. Aggregation strategy for long-range telemetry queries: pre-compute hourly buckets via cron, or compute on read with `$bucket`?
