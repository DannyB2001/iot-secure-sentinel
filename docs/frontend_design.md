# Frontend Design

## Scope

This document defines the Iris web application: routing, screens, component hierarchy, state management, and the API calls each screen makes. It references use cases (UC-XXX) from [business_requests.md](business_requests.md) and endpoints from [backend_design.md](backend_design.md).

Routes and component names match the team's uuApp submission. The frontend lives in the same Next.js project as the backend.

## Technology

- **Framework:** Next.js 16 with the App Router (React 19, TypeScript 5)
- **Styling:** Tailwind CSS v4
- **UI primitives:** shadcn/ui (Radix-based, vendored into `src/components/ui`)
- **Server state:** TanStack Query v5 in Client Components; native `fetch` in Server Components
- **Forms:** React Hook Form + `@hookform/resolvers/zod` (shared Zod schemas with backend)
- **Tables:** TanStack Table v8
- **Charts:** Recharts 3
- **Icons:** Lucide React
- **Auth client:** Auth.js v5 (`next-auth`) with the credentials provider
- **Real-time UX:** TanStack Query polling (5-second interval). No SSE, no WebSocket
- **Toasts:** `sonner`

## Entry point

**Security Management Portal** — single SPA mounted at the site root (`/`). Unauthenticated users see `/login`; authenticated users are redirected to `/dashboard`.

## Routes

| Path         | Profiles                     | UC             | Description                                               |
| ------------ | ---------------------------- | -------------- | --------------------------------------------------------- |
| `/login`     | Public                       | —              | Credentials login. Redirects to `/dashboard` if authenticated. |
| `/dashboard` | `ADMIN`, `OPERATOR`, `USER`  | UC-004         | System overview with devices summary, active alarms, recent events. |
| `/devices`   | `ADMIN`, `OPERATOR`          | UC-007         | Device list with status and location.                     |
| `/events`    | `ADMIN`, `OPERATOR`, `USER`  | UC-007         | Detected event history with filtering.                    |
| `/alarms`    | `ADMIN`, `OPERATOR`, `USER`  | UC-005, UC-006 | Active and historical alarms with acknowledgement.        |
| `/status`    | `ADMIN`, `OPERATOR`          | UC-007         | Technical system and device communication status.         |
| `/settings/registration-tokens` | `ADMIN`    | UC-001         | Issue one-time device registration tokens.                |

Middleware (`src/middleware.ts`) checks the Auth.js session on `(dashboard)` segments and redirects to `/login` when missing. Role checks happen inside Server Components that render restricted UI; Route Handlers enforce them as defense in depth.

## Project layout (frontend portion)

```
src/
|-- app/
|   |-- (auth)/
|   |   |-- layout.tsx
|   |   |-- login/page.tsx
|   |-- (dashboard)/
|   |   |-- layout.tsx                            # header + nav + query provider
|   |   |-- dashboard/page.tsx
|   |   |-- devices/page.tsx
|   |   |-- events/page.tsx
|   |   |-- alarms/page.tsx
|   |   |-- status/page.tsx
|   |   |-- settings/registration-tokens/page.tsx
|   |-- not-found.tsx
|   |-- layout.tsx
|   |-- globals.css
|-- components/
|   |-- ui/                                       # shadcn primitives (vendored)
|   |-- Header.tsx
|   |-- HomePage.tsx                              # composes the Dashboard screen
|   |-- DevicesOverview.tsx
|   |-- DeviceList.tsx
|   |-- DeviceStatusIndicator.tsx
|   |-- ActiveAlarmsPanel.tsx
|   |-- AlarmList.tsx
|   |-- AlarmTable.tsx
|   |-- AlarmRow.tsx
|   |-- AlarmStatus.tsx
|   |-- AlarmType.tsx
|   |-- AlarmFilterPanel.tsx
|   |-- ShowActiveToggle.tsx
|   |-- AcknowledgeButton.tsx
|   |-- RecentEventsButton.tsx
|   |-- EventList.tsx
|   |-- EventSeverityIndicator.tsx
|   |-- SystemStatusPanel.tsx
|   |-- OnlineDevicesCount.tsx
|   |-- OfflineDevicesCount.tsx
|   |-- RegistrationTokenForm.tsx
|-- hooks/
|   |-- useActiveAlarms.ts                        # TanStack Query, refetchInterval 5000
|   |-- useDashboardOverview.ts                   # refetchInterval 5000
|   |-- useDeviceList.ts                          # refetchInterval 30000
|   |-- useEventList.ts
|   |-- useAlarmToast.ts                          # client-side delta detector → toast
|-- lib/
|   |-- queryClient.ts
|   |-- api.ts                                    # typed fetch wrapper
|   |-- format.ts
|-- providers/
|   |-- QueryProvider.tsx
```

## Screens

### `/login`

Two-field form (email, password). On submit calls `signIn('credentials', ...)` from Auth.js. Errors render inline. Successful login redirects to `/dashboard`.

### `/dashboard`

**Purpose:** main overview page showing device state, active alarms, and recent events.

**Properties (props passed from Server Component):**

| Name               | Type    | Default | Description                                             |
| ------------------ | ------- | ------- | ------------------------------------------------------- |
| `filter`           | object  | `{}`    | Filter for displayed data (e.g. time range).            |
| `refreshInterval`  | number  | `30`    | Automatic refresh interval in seconds.                  |
| `showOnlyActive`   | boolean | `false` | Display only active alarms.                             |

**Component diagram:**

```
HomePage
├── Header
├── SystemStatusPanel
│   ├── OnlineDevicesCount
│   └── OfflineDevicesCount
├── DevicesOverview
│   ├── DeviceList
│   └── DeviceStatusIndicator
├── ActiveAlarmsPanel
│   ├── AlarmList
│   └── AcknowledgeButton
└── RecentEventsButton
    ├── EventList
    └── EventSeverityIndicator
```

**Render rules:**

| Component            | Rule                                                                   |
| -------------------- | ---------------------------------------------------------------------- |
| `Header`             | Do not display if user is not authenticated                            |
| `SystemStatusPanel`  | Do not display if no devices are registered; disabled if device data cannot be loaded |
| `ActiveAlarmsPanel`  | Do not display if the user's role does not include `view alarms`       |
| `RecentEventsButton` | Disabled when event list is loading; hidden on very narrow viewports   |

**Data:**
- Server fetch: `GET /api/dashboard/getOverview`, `GET /api/alarm/list?status=active&pageSize=5`
- Client refetch: overview every 5 s, alarms every 5 s, devices every 30 s via TanStack Query
- `useAlarmToast` compares the latest alarm `id` against the previous render and surfaces a `sonner` toast on change

### `/devices`

**Purpose:** list of devices with current status, location, and quick actions.

**Sections:**
1. `DeviceList` — TanStack Table with columns: name, type (`iotNode | gateway`), status, location, lastSeen, batteryVoltage
2. per-row actions: open detail, edit (admin)

**Data:**
- Server fetch: `GET /api/device/list`
- Client refetch: 30 s

### `/events`

**Purpose:** event history for auditing and triage.

**Filters (URL query params):**
- date range (default last 24 h)
- device (multi-select)
- sensor (multi-select, filtered by selected devices)
- eventType (multi-select)
- severity (multi-select)

**Table:** TanStack Table, server-paginated. Columns: timestamp, device, sensor, eventType, severity, message.

**Data:**
- Server fetch: `GET /api/event/list?…filters`
- Client refetch: 30 s unless user is actively filtering

### `/alarms`

**Purpose:** active and historical alarm review with acknowledgement.

**Filters:**
- `ShowActiveToggle` — quick toggle for active-only
- `AlarmFilterPanel` — alarmType, date range, status

**Table:** `AlarmTable` with `AlarmRow` components. Columns: status badge, alarmType, event summary, device, createdAt, acknowledge action.

**Row action:** `AcknowledgeButton` opens an alarm acknowledge dialog with a note field (optional, 3–500 chars) → calls `alarm/acknowledge`.

**Data:**
- Server fetch: `GET /api/alarm/list?…filters`
- Client refetch: 5 s on active filter, 30 s otherwise
- Toast on new active alarm via `useAlarmToast`

### `/status`

**Purpose:** technical system health — communication with devices, last heartbeats, battery levels.

**Sections:**
1. Fleet health summary (online / offline / warning counts)
2. Per-device last-seen matrix with battery indicators
3. Backend health (pings `/api/health`)

**Data:**
- `GET /api/device/list`
- `GET /api/health`
- Refetch every 10 s

### `/settings/registration-tokens`

**Purpose:** admin-only page to issue device registration tokens.

**Form:** `RegistrationTokenForm` with single field `issuedFor` (label). On submit: `POST /api/registration-token/issue` → modal displays the token once with a copy button. Below: list of recently issued tokens with `issuedFor`, `consumedAt`, `expiresAt` (no token values).

## Components (detailed)

### `Header`

| Prop       | Type    | Default | Description                                      |
| ---------- | ------- | ------- | ------------------------------------------------ |
| `user`     | object  | —       | Authenticated user (email, role).                |
| `onLogout` | fn      | —       | Callback to sign out.                            |

Renders app title, current route breadcrumb, user badge, logout button. Hidden if no `user`.

### `AlarmList`

| Prop             | Type     | Default | Description                                  |
| ---------------- | -------- | ------- | -------------------------------------------- |
| `alarms`         | array    | `[]`    | Alarms to display.                           |
| `showOnlyActive` | boolean  | `false` | Filter for active only.                      |
| `onAcknowledge`  | function | `null`  | Callback invoked when a row is acknowledged. |
| `loading`        | boolean  | `false` | Shows loading skeleton when true.            |

**Diagram:**
```
AlarmList
├── AlarmFilterPanel
│   └── ShowActiveToggle
└── AlarmTable
    └── AlarmRow
        ├── AlarmStatus
        ├── AlarmType
        ├── Timestamp
        └── AcknowledgeButton
```

**Render rules:**

| Component          | Rule                                               |
| ------------------ | -------------------------------------------------- |
| `AlarmFilterPanel` | Do not display if no alarms available              |
| `AlarmTable`       | Disabled while `loading === true`; hidden when `alarms` is empty |

### `DeviceList`, `DeviceStatusIndicator`

`DeviceList` renders rows with `DeviceStatusIndicator` (colored dot: green for `online`, yellow for `warning`, gray for `offline`) + name + location + lastSeen relative time + battery icon.

### `EventList`, `EventSeverityIndicator`

`EventList` is a simple list view. `EventSeverityIndicator` shows colored pill (green / yellow / orange / red) for `low | medium | high | critical`.

### `SystemStatusPanel`

Aggregates `OnlineDevicesCount` and `OfflineDevicesCount` plus a status banner. Pulls from `useDashboardOverview`.

### `RegistrationTokenForm`

Single-input form with submit. Modal on success showing the token exactly once with a copy-to-clipboard button.

## Hooks

### `useActiveAlarms`

```ts
export function useActiveAlarms(initialData?: AlarmListResponse) {
  return useQuery({
    queryKey: ["alarm", "list", { status: "active" }],
    queryFn: () => api.alarm.list({ status: "active" }),
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
          toast.error(`New alarm: ${a.alarmType} at ${a.device.name}`, {
            action: { label: "View", onClick: () => router.push(`/alarms?focus=${a.id}`) },
          });
        }
      }
    }
  }, [alarms]);
}
```

## State management

- **Server state:** TanStack Query in Client Components, hydrated from Server Component initial data
- **UI state:** local `useState` / `useReducer` per component
- **Session:** `useSession()` from `next-auth/react`
- **No global store**

## Authorization in the UI

| Control                           | ADMIN | OPERATOR | USER | DEVICE |
| --------------------------------- | ----- | -------- | ---- | ------ |
| Navigate to `/dashboard`          | yes   | yes      | yes  | no     |
| Navigate to `/devices`            | yes   | yes      | no   | no     |
| Navigate to `/events`             | yes   | yes      | yes  | no     |
| Navigate to `/alarms`             | yes   | yes      | yes  | no     |
| Navigate to `/status`             | yes   | yes      | no   | no     |
| Navigate to `/settings/registration-tokens` | yes | no   | no   | no     |
| Click `AcknowledgeButton`         | yes   | yes      | no   | no     |
| Edit device (update name/location)| yes   | no       | no   | no     |
| Register sensor                   | yes   | no       | no   | no     |

Forbidden controls are removed from the DOM. Route Handlers enforce the same matrix.

## Loading, empty, and error states

Every data-bound component handles three states:

1. **loading**: shadcn `Skeleton` placeholders sized like the final layout
2. **empty**: friendly empty-state with an action prompt
3. **error**: `Alert` variant `destructive` showing `error.code` and `error.message`

Network errors from TanStack Query surface as toasts plus a re-fetch button.

## Accessibility

- all interactive elements reachable via keyboard
- ARIA labels on icon-only buttons and status indicators
- color is never the sole indicator (paired with text or shape)
- minimum contrast 4.5:1 (WCAG AA)
- form fields use `<label>` associations and `aria-describedby` for errors

## Responsive breakpoints (Tailwind v4)

| Breakpoint              | Layout                                                          |
| ----------------------- | --------------------------------------------------------------- |
| `lg` (≥ 1024 px)        | sidebar navigation, three-column dashboard grid                 |
| `md` (768–1023 px)      | top navigation, two-column grid                                 |
| default (< 768 px)      | bottom tab bar, single-column list                              |

## Testing

- **Unit:** Vitest for hooks and utilities
- **Component:** React Testing Library + MSW for API mocks
- **E2E:** Playwright covering login → see new alarm via polling → acknowledge; register a sensor; issue a registration token

## Implementation milestones

| Milestone | Scope                                                                             |
| --------- | --------------------------------------------------------------------------------- |
| F-M1      | Next.js scaffold, Tailwind v4, shadcn init, login page, `(dashboard)` layout, `/dashboard` with stub data |
| F-M2      | Real data via Server Components + TanStack Query (`useDashboardOverview`, `useActiveAlarms`, `useDeviceList`) |
| F-M3      | `/devices` and `/events` routes with TanStack Table                                |
| F-M4      | `/alarms` route with `AlarmTable`, `AcknowledgeButton`, `useAlarmToast`            |
| F-M5      | `/status` route with device health matrix                                          |
| F-M6      | `/settings/registration-tokens` admin page                                         |
| F-M7      | Permission-aware rendering, empty / error states polish, accessibility pass        |
| F-M8      | Playwright E2E coverage for golden paths                                           |

## Open questions

1. Theme: light only for MVP, or include dark mode from the start?
2. Internationalization: English only, or Czech via `next-intl` from the start?
3. Server Actions for mutations: use `useFormState` + Server Actions for some forms instead of TanStack Query mutations?
