# cloud-app

Next.js 16 cloud application for Iris Gateway. Holds both the React frontend and the REST API (Route Handlers under `app/api/`).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript 5
- MongoDB Atlas (M0 free tier) via Mongoose 8
- Auth.js v5 for user authentication (Argon2id passwords)
- HMAC SHA-256 + UUID nonce for gateway authentication
- Zod for input validation (shared schemas with the frontend)
- shadcn/ui + Tailwind CSS v4
- TanStack Query v5 (5 s polling for real-time UX, no SSE)
- Vercel for hosting + Vercel Cron for background tasks

## Project structure

See [../docs/backend_design.md](../docs/backend_design.md) for the full layout. Headline directories:

- `src/app/`: App Router routes and API endpoints
- `src/components/`: UI components (`ui/` for shadcn primitives, others for feature components)
- `src/models/`: Mongoose schemas
- `src/lib/validation/`: Zod schemas (imported by Route Handlers and frontend forms)
- `src/services/`: business logic per domain
- `src/hooks/`: TanStack Query hooks for the frontend
- `vercel.json`: Cron schedule

## Local development

```bash
bun install
cp .env.example .env.local
docker compose up -d        # local MongoDB on 27017
bun run db:seed             # creates an admin user and a demo gateway
bun dev                     # http://localhost:3000
```

Default admin credentials after `db:seed`: `admin@example.com` / `admin`.

## Implementation reference

- [docs/business_requests.md](../docs/business_requests.md): actors, use cases, business requirements
- [docs/api_contract.md](../docs/api_contract.md): wire-level data formats and authentication headers
- [docs/backend_design.md](../docs/backend_design.md): endpoints, Mongoose schemas, validation, error envelope
- [docs/frontend_design.md](../docs/frontend_design.md): routes, components, state, permissions
- [docs/deployment.md](../docs/deployment.md): Vercel + MongoDB Atlas deployment

## Implementation status

Placeholder. Milestone M1 (`POST /api/gateway/register`, `POST /api/telemetry`, `POST /api/alarm` end-to-end against a local Node-RED flow) is the first deliverable. See [docs/backend_design.md](../docs/backend_design.md) for the full milestone plan.
