# cloud-app

Next.js 16 cloud application for Iris Gateway. Holds both the React frontend and the REST API (Route Handlers under `app/api/`). Endpoint paths follow the team's uuApp command names (e.g. `device/register` → `POST /api/device/register`).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript 5
- MongoDB Atlas (M0 free tier) via Mongoose 8
- Auth.js v5 for user authentication (Argon2id passwords; `ADMIN | OPERATOR | USER` roles)
- Bearer token authentication for the `DEVICE` role (per-device API token, SHA-256 hashed at rest)
- Zod for input validation (shared schemas with the frontend)
- shadcn/ui + Tailwind CSS v4
- TanStack Query v5 (5 s polling for real-time UX, no SSE)
- Vercel for hosting + Vercel Cron for background tasks

## Project structure

See [../docs/backend_design.md](../docs/backend_design.md) for the full layout. Headline directories:

- `src/app/(dashboard)/` — `/dashboard`, `/devices`, `/events`, `/alarms`, `/status`, `/settings/registration-tokens`
- `src/app/api/<command>/` — Route Handlers per uuApp command (`device/register`, `event/create`, `alarm/acknowledge`, etc.)
- `src/components/` — UI components (`ui/` for shadcn primitives, others for feature components like `AlarmList`, `DeviceList`)
- `src/models/` — Mongoose schemas (`Device`, `Sensor`, `Event`, `Alarm`, `User`, `RegistrationToken`, `AuditLog`)
- `src/lib/validation/` — Zod schemas (imported by Route Handlers and frontend forms)
- `src/services/` — business logic per domain (`event-service`, `alarm-service`, `dashboard-service`)
- `vercel.json` — Cron schedule

## Local development

```bash
bun install
cp .env.example .env.local
docker compose up -d        # local MongoDB on 27017
bun run db:seed             # creates an admin user
bun dev                     # http://localhost:3000
```

Default admin credentials after `db:seed`: `admin@example.com` / `admin`.

## Implementation reference

- [docs/business_requests.md](../docs/business_requests.md): role profiles, actors, use cases, business requirements
- [docs/api_contract.md](../docs/api_contract.md): wire-level data formats and authentication headers
- [docs/backend_design.md](../docs/backend_design.md): commands, Mongoose schemas, validation, error envelope
- [docs/frontend_design.md](../docs/frontend_design.md): routes, components, state, permissions
- [docs/deployment.md](../docs/deployment.md): Vercel + MongoDB Atlas deployment

## Implementation status

Placeholder. Milestone M1 (`device/register`, `device/heartbeat`, `event/create` end-to-end against a local Node-RED flow) is the first deliverable. See [docs/backend_design.md](../docs/backend_design.md) for the full milestone plan.
