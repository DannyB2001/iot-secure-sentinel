# Frontend Design

## Scope

This document defines the Iris Cloud App frontend: routing, screens, component hierarchy, state management, and the API calls each screen makes. It references use cases (UC-XXX) from [business_requests.md](business_requests.md) and endpoints from [backend_design.md](backend_design.md).

The frontend lives in the same Next.js project as the backend (single repository, single deploy on Vercel).

## Technology

- **Framework:** Next.js 16 with the App Router (React 19, TypeScript 5)
- **Styling:** Tailwind CSS v4 with OKLCh color tokens
- **UI primitives:** shadcn/ui (Radix-based, vendored into `src/components/ui`)
- **Server state:** TanStack Query v5 in Client Components; native `fetch` in Server Components
- **Forms:** React Hook Form + `@hookform/resolvers/zod` (shared Zod schemas with backend)
- **Tables:** TanStack Table v8
- **Charts:** Recharts 3
- **Icons:** Lucide React
- **Auth client:** Auth.js v5 (`next-auth`) with the credentials provider
- **Real-time UX:** TanStack Query polling on a 5-second interval. No EventSource, no WebSocket
- **Toasts:** `sonner`
- **Animations:** none in MVP

## Project layout (frontend portion)

```
src/
|-- app/
|   |-- (auth)/
|   |   |-- layout.tsx
|   |   |-- login/page.tsx
|   |-- (dashboard)/
|   |   |-- layout.tsx                            # nav, header, query provider
|   |   |-- page.tsx                              # /
|   |   |-- gateway/[id]/page.tsx
|   |   |-- alarms/page.tsx
|   |   |-- settings/page.tsx                     # settings index
|   |   |-- settings/gateway/[id]/page.tsx
|   |   |-- settings/registration-tokens/page.tsx # admin only
|   |-- not-found.tsx
|   |-- layout.tsx
|   |-- globals.css                               # Tailwind v4 @import + tokens
|-- components/
|   |-- ui/                                       # shadcn primitives (vendored)
|   |-- gateway-card.tsx
|   |-- gateway-list.tsx
|   |-- alarm-row.tsx
|   |-- alarm-list.tsx
|   |-- alarm-acknowledge-dialog.tsx
|   |-- telemetry-chart.tsx
|   |-- armed-toggle.tsx
|   |-- threshold-form.tsx
|   |-- kpi-tiles.tsx
|   |-- notification-badge.tsx
|   |-- alarm-banner.tsx
|   |-- registration-token-form.tsx
|-- hooks/
|   |-- use-gateway-list.ts                       # TanStack Query, refetchInterval 30 s
|   |-- use-unresolved-alarms.ts                  # TanStack Query, refetchInterval 5 s
|   |-- use-telemetry.ts
|   |-- use-alarm-toast.ts                        # client-side delta detector → toast
|-- lib/
|   |-- query-client.ts
|   |-- api.ts                                    # typed fetch wrapper
|   |-- format.ts                                 # date, number, units
|-- providers/
|   |-- query-provider.tsx
```

## Routing

Next.js App Router groups segments with parentheses for layout scoping without affecting the URL.

| Path                                       | Type             | UC             | Access                           |
| ------------------------------------------ | ---------------- | -------------- | -------------------------------- |
| `/login`                                   | Server + Client  | —              | Public (redirect to `/` if logged in) |
| `/`                                        | Server           | UC-004         | Authenticated                    |
| `/gateway/:id`                             | Server           | UC-004         | Authenticated                    |
| `/alarms`                                  | Server           | UC-004, UC-005 | Authenticated                    |
| `/settings`                                | Server           | UC-006         | role `admin` or `operator`       |
| `/settings/gateway/:id`                    | Server + Client  | UC-006, UC-008 | role `admin` or `operator`       |
| `/settings/registration-tokens`            | Server + Client  | UC-001         | role `admin`                     |

Middleware (`src/middleware.ts`) checks the Auth.js session on `(dashboard)` segments and redirects to `/login` when missing. Role checks happen inside Server Components that render restricted UI; the Route Handler enforces them as defense in depth.

## Server vs Client Components

| Pattern                             | Component type   | Why                                              |
| ----------------------------------- | ---------------- | ------------------------------------------------ |
| Initial dashboard data load         | Server           | SSR with `fetch` to internal Route Handlers; fast TTFB |
| Telemetry chart (interactive)       | Client           | hover, zoom, polling                             |
| Alarm list with row actions         | Client           | inline acknowledge dialog                        |
| Threshold form                      | Client           | RHF + Zod, optimistic updates                    |
| Armed-state toggle                  | Client           | optimistic toggle with rollback                  |
| KPI tiles                           | Server initial / Client refresh | server renders first paint, client polls every 5 s |
| Header / nav                        | Server           | session lookup happens server-side               |

A Server Component fetches initial data and passes it as `initialData` to a Client Component using TanStack Query. The result is instant first paint plus background freshness via polling.

```tsx
// app/(dashboard)/page.tsx (Server)
const initialGateways = await api.gateway.list();
const initialAlarms = await api.alarm.list({ state: "unresolved", pageSize: 5 });
return <DashboardClient initialGateways={initialGateways} initialAlarms={initialAlarms} />;
```

```tsx
// components/dashboard-client.tsx (Client)
"use client";
const gatewayQuery = useQuery({
  queryKey: ["gateway", "list"],
  queryFn: () => api.gateway.list(),
  initialData: initialGateways,
  refetchInterval: 30_000,
});
const alarmQuery = useUnresolvedAlarms();
useAlarmToast(alarmQuery.data?.items ?? []);
```

## Screens

### Login (`/login`)

Two-field form (email, password). On submit calls `signIn('credentials', ...)` from Auth.js. Errors render inline. Successful login redirects to `/`. If already authenticated, redirects to `/` on mount.

### Dashboard (`/`)

**Purpose:** one-screen view of all gateways, KPIs, recent unresolved alarms.

```
+--------------------------------------------------------------------+
|  Iris Gateway                                   [user]  [logout]   |
+--------------------------------------------------------------------+
|  KPI tiles:                                                        |
|  [ Active: 4 ]  [ Unresolved alarms: 2 ]  [ Avg temp: 22.8 °C ]    |
+--------------------------------------------------------------------+
|  Gateways                                                          |
|  +---------------------+  +---------------------+                  |
|  | Server room A       |  | Archive B           |                  |
|  | armed | active      |  | disarmed | active   |                  |
|  | 22.4 °C             |  | 21.1 °C             |                  |
|  | [ details ]         |  | [ details ]         |                  |
|  +---------------------+  +---------------------+                  |
+--------------------------------------------------------------------+
|  Recent alarms (unresolved)                                        |
|  +------------------------------------------------------------+    |
|  | 08:30 | Server room A | accel 1.94 g | [ acknowledge ]     |    |
|  | 07:12 | Archive B     | accel 1.31 g | [ acknowledge ]     |    |
|  +------------------------------------------------------------+    |
+--------------------------------------------------------------------+
```

**Components:** `KpiTiles`, `GatewayList` (renders `GatewayCard[]`), `AlarmList` (limit 5).

**Data:**
- Server fetch: `GET /api/gateway`, `GET /api/alarm?state=unresolved&pageSize=5`
- Client refetch: gateway list every 30 s, alarm list every **5 s** via TanStack Query
- Toast: `useAlarmToast` compares latest alarm `id` against the previous render and surfaces a `sonner` toast on change

### Gateway detail (`/gateway/:id`)

**Purpose:** single-gateway view with telemetry chart, armed toggle, alarm history.

**Sections:**
1. Header with gateway name, state badge, and last-seen relative time
2. `ArmedToggle` (top-right)
3. Temperature chart over a 24 h rolling window
4. Acceleration chart of 24 h peaks per 5-minute bucket
5. Alarm history for this gateway, paginated
6. Link to `/settings/gateway/:id` (visible only with role `admin` or `operator`)

**Data:**
- Server fetch: `GET /api/gateway/:id`, `GET /api/telemetry?gatewayId=:id&from=now-24h`, first page of `GET /api/alarm?gatewayId=:id`
- Polling: gateway state every 30 s, alarm list every 5 s, telemetry every 30 s

### Alarms (`/alarms`)

**Purpose:** workspace-wide alarm log with filters.

**Filters (URL query params):**
- date range (default last 7 days)
- gateway (multi-select)
- state (`all | unresolved | acknowledged`)
- priority (`all | high | medium | low`)

**Table:** `TanStack Table v8`, server-side paginated.

**Row actions:**
- click → drawer with full alarm payload
- `Acknowledge` → opens `AlarmAcknowledgeDialog`

**Data:**
- Server fetch: `GET /api/alarm?…filters`
- Client polling: 5 s on the unresolved view, 30 s otherwise (less critical)

### Settings index (`/settings`)

**Purpose:** entry point for admins/operators. Lists all gateways with quick links to per-gateway config, plus a link to registration tokens (admin only).

**Data:** `GET /api/gateway`

### Gateway settings (`/settings/gateway/:id`)

**Purpose:** configure thresholds and IDS rules for one gateway.

**Form fields (`ThresholdForm`):**
- acceleration threshold (number, 0.1–5.0, step 0.05)
- telemetry interval seconds (integer, 10–3600)
- aggregation window samples (integer, 1–20)
- IDS enabled (switch, iteration 2)
- IDS rules editor (list of `{ id, signatureId, action }`, iteration 2)

**Validation:** `UpdateGatewayConfigInput` Zod schema imported from `src/lib/validation/gateway.ts` and bound to React Hook Form via the resolver. Server returns the same schema's error codes inline.

**Actions:**
- `Save` → `PATCH /api/gateway/:id/config` → toast with new `configVersion`
- `Reset to defaults` → restore factory config locally, then explicit `Save`

### Registration tokens (`/settings/registration-tokens`)

**Purpose:** admin-only page to issue gateway registration tokens.

**Layout:**
- form: `RegistrationTokenForm` with one field `issuedFor` (label, e.g. "iris-gw-005 / Building 7")
- on submit: `POST /api/registration-token` → modal displays the token once with a copy button and an expiry hint
- table below: list of recently issued tokens with `issuedFor`, `consumedAt`, `expiresAt` (no token values)

## Components

### `GatewayCard`

Props:
```ts
type GatewayCardProps = {
  gateway: GatewayListItem;
  onOpen: (id: string) => void;
};
```

Renders name, location, two state indicators (armed, active), latest temperature (`gateway.lastTemperatureC` from the list response), `details` button → `/gateway/:id`.

### `AlarmRow`

Props:
```ts
type AlarmRowProps = {
  alarm: AlarmListItem;
  onAcknowledge: (alarm: AlarmListItem) => void;
};
```

Renders relative timestamp ("2 min ago"), gateway name, sensor `deviceId`, trigger value, acknowledge button (hidden when `state === 'acknowledged'`).

### `AlarmAcknowledgeDialog`

shadcn `Dialog` with a textarea (required, 3–500 chars) and confirm button. Calls `POST /api/alarm/:id/acknowledge`. Optimistic update via TanStack Query mutation with `onMutate` / `onError` rollback.

### `TelemetryChart`

Props:
```ts
type TelemetryChartProps = {
  gatewayId: string;
  from: string;
  to: string;
};
```

Renders Recharts `<LineChart>` with two series: `temperatureC` (light) and `avgTemperatureC` (bold). X-axis time, Y-axis °C. Internal: `useTelemetry` hook (TanStack Query), refresh every 30 s, switches to hourly aggregation when range > 24 h.

### `ArmedToggle`

Props:
```ts
type ArmedToggleProps = {
  gatewayId: string;
  armedState: "armed" | "disarmed";
};
```

shadcn `Switch`. Calls `PATCH /api/gateway/:id/armed-state`. Optimistic update with rollback on error. Hidden for `reader` role.

### `ThresholdForm`

React Hook Form bound to `UpdateGatewayConfigInput` Zod schema. Tracks `formState.isDirty`. `Save` is disabled when pristine. Server errors map back to fields via `setError`.

### `KpiTiles`

Three tiles: active gateway count, unresolved alarm count, average temperature across active gateways. Tile color shifts to red when `unresolved > 0`.

### `NotificationBadge`

Header-mounted dot + counter. Click navigates to `/alarms?state=unresolved`. Badge value comes from the same `useUnresolvedAlarms()` query so the number stays in sync with the dashboard.

### `AlarmBanner`

Persistent red banner mounted in the dashboard layout when any gateway is `inactive` or any alarm is `unresolved`. Click dismisses for the session (state in URL hash).

### `RegistrationTokenForm`

Single-input form with submit. Modal on success showing the token exactly once.

## Hooks

### `useUnresolvedAlarms`

```ts
export function useUnresolvedAlarms(initialData?: AlarmListResponse) {
  return useQuery({
    queryKey: ["alarm", "list", { state: "unresolved" }],
    queryFn: () => api.alarm.list({ state: "unresolved" }),
    initialData,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}
```

### `useAlarmToast`

```ts
export function useAlarmToast(alarms: AlarmListItem[]) {
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const a of alarms) {
      if (!seen.current.has(a.id)) {
        seen.current.add(a.id);
        if (seen.current.size > 1) {
          // skip toast on initial population
          toast.error(`New alarm: ${a.gatewayName} (${a.accelG.toFixed(2)} g)`, {
            action: { label: "View", onClick: () => router.push(`/alarms?focus=${a.id}`) },
          });
        }
      }
    }
  }, [alarms]);
}
```

This is the entire "real-time" mechanism. No streaming, no event sources, no extra connections.

## State management

- **Server state:** TanStack Query in Client Components, hydrated from Server Component initial data.
- **UI state:** local `useState` / `useReducer` per component.
- **Session:** `useSession()` from `next-auth/react`.
- **No global store**. No context for events.

## Authorization in the UI

Hidden controls per role (mirrors backend `requireRole(...)`):

| Control                         | admin | operator | user | reader |
| ------------------------------- | ----- | -------- | ---- | ------ |
| View dashboard                  | yes   | yes      | yes  | yes    |
| Acknowledge alarm               | yes   | yes      | yes  | no     |
| Toggle armed state              | yes   | yes      | yes  | no     |
| Edit gateway configuration      | yes   | yes      | no   | no     |
| Settings link in nav            | yes   | yes      | no   | no     |
| Issue registration token        | yes   | no       | no   | no     |

Forbidden controls are removed from the DOM, not merely disabled. The Route Handler enforces the same matrix; the UI only stops users from trying.

## Loading, empty, and error states

Every data-bound component handles three states:

1. **loading**: shadcn `Skeleton` placeholders sized like the final layout
2. **empty**: friendly empty-state with an action prompt
3. **error**: `Alert` variant `destructive` showing `error.code` and `error.message` from the server envelope

Network errors from TanStack Query surface as toasts plus a re-fetch button.

## Notifications in the UI

- **Toast**: `sonner`, 4 s duration, used for action outcomes (`Alarm acknowledged`, `Config saved`, `Failed to save`) and for new alarms detected by `useAlarmToast`
- **Banner**: `AlarmBanner` for persistent state at the top of every dashboard route
- **Real-time**: polling-driven; no separate channel

## Accessibility

- all interactive elements reachable via keyboard (Tab, Shift+Tab, Enter, Space)
- ARIA labels on icon-only buttons and badges
- color is never the sole indicator (paired with text or shape)
- minimum contrast 4.5:1 (WCAG AA)
- form fields use `<label>` associations and `aria-describedby` for errors
- focus rings preserved (no `outline: none` without replacement)

## Responsive breakpoints (Tailwind v4)

| Breakpoint              | Layout                                                          |
| ----------------------- | --------------------------------------------------------------- |
| `lg` (≥ 1024 px)        | three-column gateway grid, sidebar navigation                   |
| `md` (768–1023 px)      | two-column gateway grid, top navigation                         |
| default (< 768 px)      | single-column list, bottom tab bar, simplified charts           |

Recharts renders inside a `<ResponsiveContainer>` so charts scale with their parent.

## Testing

- **Unit:** Vitest for hooks and utilities
- **Component:** React Testing Library for components in isolation, MSW for API mocks
- **E2E:** Playwright covering the golden paths (login → see new alarm via polling → acknowledge; arm/disarm; threshold change)

## Implementation milestones

| Milestone | Scope                                                                         |
| --------- | ----------------------------------------------------------------------------- |
| F-M1      | Next.js scaffold, Tailwind v4, shadcn init, login page, `(dashboard)` layout, `/` with stub data |
| F-M2      | Real data via Server Components, TanStack Query for refetch, `KpiTiles` and `GatewayList` |
| F-M3      | Gateway detail with `TelemetryChart`                                          |
| F-M4      | Alarms route with TanStack Table, `AlarmAcknowledgeDialog`, `useAlarmToast`   |
| F-M5      | Settings index + per-gateway settings with `ThresholdForm`                    |
| F-M6      | Registration tokens admin page                                                |
| F-M7      | Permission-aware rendering, empty / error states polish, accessibility pass   |
| F-M8      | Playwright E2E coverage for golden paths                                      |

## Open questions

1. Theme: light only for MVP, or include dark mode from the start (shadcn supports it natively)?
2. Internationalization: English only, or include Czech using `next-intl` from the start?
3. Server Actions for mutations: use `useFormState` + Server Actions instead of TanStack Query mutations for some forms (lighter bundle, native form semantics)?
