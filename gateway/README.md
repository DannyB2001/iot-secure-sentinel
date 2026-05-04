# Gateway

Node-RED flow for the Raspberry Pi edge gateway. The flow accepts the normalized HARDWARIO node payload, stores/publishes local telemetry, and forwards MVP events to the cloud app.

## Runtime Inputs

The included `flows.json` expects node payloads shaped like:

```json
{
  "deviceId": "node-01",
  "timestamp": "2026-05-04T10:15:00.000Z",
  "temperatureC": 24.7,
  "accelG": 0.18,
  "alarm": false,
  "batteryVoltage": 2.95,
  "transport": "radio"
}
```

It maps them to the current cloud MVP contract:

- `alarm: true` -> `type: "tamper"`, `sensorKey: "core-accelerometer"`
- normal telemetry -> `type: "temperature"`, `sensorKey: "core-thermometer"`
- `batteryVoltage` -> `type: "battery"`, `sensorKey: "core-battery"`

## Cloud Forwarder Config

Set these environment variables for the Node-RED process:

```bash
CLOUD_BASE_URL=http://<notebook-ip>:3000
DEVICE_NAME=mock-gateway-01
DEVICE_TOKEN=mock-token-please-rotate
```

For the systemd service from `docs/deployment.md`, add them under `[Service]`:

```ini
Environment="CLOUD_BASE_URL=http://<notebook-ip>:3000"
Environment="DEVICE_NAME=mock-gateway-01"
Environment="DEVICE_TOKEN=mock-token-please-rotate"
```

Then reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart nodered
```

The demo defaults are intentional: `cloud-app` seeds the same mock gateway and token on first boot. For a real gateway, set matching `SEED_DEVICE_NAME` and `SEED_DEVICE_TOKEN` in `cloud-app/.env.local` before the database is seeded.

## First Hardware Demo

1. Start `cloud-app` on the notebook with `bun dev --hostname 0.0.0.0`.
2. On the Pi, verify `curl http://<notebook-ip>:3000/login`.
3. Import `gateway/flows.json` into Node-RED.
4. Configure the MQTT broker node to `127.0.0.1:1883`.
5. Configure or temporarily disconnect MongoDB output nodes if local MongoDB is not installed yet.
6. Click the `Demo payload` inject node.
7. Check the `Cloud response` debug node for `201` or `200 duplicate` responses.
