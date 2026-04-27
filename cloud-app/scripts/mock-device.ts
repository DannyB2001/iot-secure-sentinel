/**
 * Mock device that posts events to the running cloud-app via /api/event/create.
 * Use this to demo the end-to-end flow without real HARDWARIO hardware.
 *
 * Usage:
 *   bun run scripts/mock-device.ts
 *
 * Override defaults via env:
 *   SEED_DEVICE_NAME, SEED_DEVICE_TOKEN, MOCK_BASE_URL, MOCK_INTERVAL_MS
 */

const BASE_URL = process.env.MOCK_BASE_URL ?? "http://localhost:3000";
const DEVICE_NAME = process.env.SEED_DEVICE_NAME ?? "mock-gateway-01";
const TOKEN = process.env.SEED_DEVICE_TOKEN ?? "mock-token-please-rotate";
const INTERVAL_MS = Number(process.env.MOCK_INTERVAL_MS ?? "8000");

type EventPayload = {
  deviceName: string;
  sensorKey: string;
  type: "temperature" | "tamper" | "heartbeat" | "battery";
  value?: number;
  message?: string;
  timestamp: string;
};

let stopRequested = false;

async function postEvent(payload: EventPayload): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/event/create`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  console.log(`[${payload.type}] ${res.status} ${body}`);
}

function buildScenario(): EventPayload[] {
  const now = new Date();
  return [
    {
      deviceName: DEVICE_NAME,
      sensorKey: "core-thermometer",
      type: "temperature",
      value: 22 + Math.random() * 4,
      timestamp: now.toISOString(),
    },
    {
      deviceName: DEVICE_NAME,
      sensorKey: "core-accelerometer",
      type: "tamper",
      message: "Acceleration above threshold (mock).",
      timestamp: new Date(now.getTime() + 1000).toISOString(),
    },
    {
      deviceName: DEVICE_NAME,
      sensorKey: "core-thermometer",
      type: "temperature",
      value: 55 + Math.random() * 5,
      timestamp: new Date(now.getTime() + 2000).toISOString(),
    },
    {
      deviceName: DEVICE_NAME,
      sensorKey: "core-battery",
      type: "battery",
      value: 2.6,
      timestamp: new Date(now.getTime() + 3000).toISOString(),
    },
    {
      deviceName: DEVICE_NAME,
      sensorKey: "core-heartbeat",
      type: "heartbeat",
      timestamp: new Date(now.getTime() + 4000).toISOString(),
    },
  ];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`[mock-device] posting to ${BASE_URL} as ${DEVICE_NAME} every ${INTERVAL_MS} ms`);

  const onSignal = (signal: NodeJS.Signals) => {
    console.log(`[mock-device] received ${signal}, exiting after current iteration.`);
    stopRequested = true;
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  while (!stopRequested) {
    for (const event of buildScenario()) {
      if (stopRequested) break;
      try {
        await postEvent(event);
      } catch (err) {
        console.error("[mock-device] error:", err);
      }
    }
    if (stopRequested) break;
    await sleep(INTERVAL_MS);
  }

  console.log("[mock-device] stopped.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
