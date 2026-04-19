# Deployment

## Scope

This document describes how to deploy Iris Gateway end-to-end: the Raspberry Pi gateway with Node-RED, Mosquitto, and MongoDB; the HARDWARIO sensor node; and the Next.js cloud application on Vercel with MongoDB Atlas.

Targets a single gateway and a single tenant. Multi-gateway deployment is an extension of the same steps.

Companion documents:
- [iot_design.md](iot_design.md): hardware and firmware reference
- [backend_design.md](backend_design.md): Route Handlers, Mongoose models
- [frontend_design.md](frontend_design.md): Next.js routes and components

## Prerequisites

- Raspberry Pi 4 (2 GB or more) with Raspberry Pi OS 64-bit (Bookworm)
- HARDWARIO Core Module flashed with Iris Gateway firmware
- HARDWARIO USB Radio Gateway stick (or USB CDC for wired bring-up)
- Local workstation with **Bun 1.2+**, `git`, and Docker Desktop (or Docker Engine) for local Mongo
- A Vercel account (free Hobby tier)
- A MongoDB Atlas account (free M0 tier)

No Railway. No PostgreSQL. No separate worker service.

## 1. Local development

```bash
git clone https://github.com/<org>/iot-secure-sentinel.git
cd iot-secure-sentinel/cloud-app

bun install
cp .env.example .env.local         # see "Environment variables" below
docker compose up -d               # local MongoDB
bun run db:seed                    # seeds admin user and demo gateway
bun dev                            # http://localhost:3000
```

### `docker-compose.yml` (local Mongo only)

```yaml
services:
  mongo:
    image: mongo:7
    container_name: iris-mongo
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

### Environment variables

`.env.local` (development):

```
MONGODB_URI="mongodb://localhost:27017/iris"
AUTH_SECRET="<generate with: openssl rand -base64 32>"
AUTH_URL="http://localhost:3000"
CRON_SECRET="<generate with: openssl rand -base64 32>"
LOG_LEVEL=debug
```

Production secrets live in the Vercel dashboard, never in the repo.

### Mongo indexes

Mongoose creates indexes from schema definitions on first connection. To force creation in development:

```bash
bun run db:indexes
```

This runs a small script that imports all models and calls `Model.syncIndexes()` for each.

## 2. Cloud database: MongoDB Atlas

1. Sign in to [cloud.mongodb.com](https://cloud.mongodb.com), create a new project named `iris-gateway`.
2. `Build a Database → M0 Free → AWS, region nearest to your Vercel deployment`. Wait ~3 minutes for provisioning.
3. `Database Access → Add New Database User`: username `iris_app`, autogenerate a strong password, role `Read and write to any database`. Save the password.
4. `Network Access → Add IP Address → Allow Access from Anywhere (0.0.0.0/0)`. Atlas M0 has no VPC peering; auth is the security boundary.
5. `Database → Connect → Drivers → Node.js`. Copy the connection string. Replace `<password>` with the actual password and append `/iris`:

   ```
   mongodb+srv://iris_app:<PASSWORD>@cluster0.xxxxx.mongodb.net/iris?retryWrites=true&w=majority
   ```

6. Save this as `MONGODB_URI` in Vercel (next step).

Atlas snapshots are automatic on M0 (basic, daily). For more frequent backups upgrade to M10 or use an external mongodump cron.

## 3. Cloud app: Vercel deployment

```bash
cd cloud-app
bun add -g vercel
vercel login
vercel link                        # link to a new or existing project
```

In the Vercel dashboard, set environment variables for the Production environment:

| Variable        | Value                                              |
| --------------- | -------------------------------------------------- |
| `MONGODB_URI`   | Atlas connection string from step 2                |
| `AUTH_SECRET`   | `openssl rand -base64 32`                          |
| `AUTH_URL`      | `https://<your-project>.vercel.app`                |
| `CRON_SECRET`   | `openssl rand -base64 32`                          |
| `LOG_LEVEL`     | `info`                                             |

Then deploy:

```bash
vercel --prod
```

Vercel runs `bun install && bun run build`. Mongoose connects to Atlas on the first request (warm cache via global singleton in `src/lib/mongo.ts`).

### `vercel.json` (Cron schedule)

```json
{
  "crons": [
    { "path": "/api/cron/tick", "schedule": "* * * * *" }
  ]
}
```

Vercel hits `GET /api/cron/tick` once per minute (Hobby tier supports this). The handler authenticates via `Authorization: Bearer ${CRON_SECRET}` header that Vercel adds automatically.

### Seed an admin user

After the first deploy, create the admin user so you can log in:

```bash
vercel env pull .env.production.local
MONGODB_URI=$(grep MONGODB_URI .env.production.local | cut -d= -f2- | tr -d '"') \
  bun run scripts/create-admin.ts admin@example.com 'StrongPassword123!'
```

The script uses the same Argon2id hashing the runtime uses.

## 4. Gateway: base OS

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y curl gnupg ca-certificates git build-essential
sudo timedatectl set-timezone Europe/Prague
```

Install `chrony` for clock sync (the cloud rejects events with timestamps more than 5 min in the future):

```bash
sudo apt install -y chrony
sudo systemctl enable --now chrony
```

Configure a static IP for the management interface using NetworkManager:

```bash
sudo nmcli con mod "Wired connection 1" ipv4.method manual ipv4.addresses 192.168.1.50/24 ipv4.gateway 192.168.1.1 ipv4.dns "1.1.1.1 8.8.8.8"
sudo nmcli con up "Wired connection 1"
```

(The second NIC is reserved for the IoT subnet in iteration 2.)

## 5. Gateway: dedicated user + Node.js + Node-RED

Create a dedicated user so Node-RED does not run as root:

```bash
sudo adduser --system --group --home /var/lib/node-red node-red
sudo mkdir -p /etc/iris-gateway
sudo chown node-red:node-red /etc/iris-gateway
sudo chmod 750 /etc/iris-gateway
```

Install Node.js 22 and Node-RED:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

sudo npm install -g --unsafe-perm node-red

# systemd unit running as the node-red user
sudo tee /etc/systemd/system/nodered.service <<'EOF'
[Unit]
Description=Node-RED
After=network.target

[Service]
Type=simple
User=node-red
WorkingDirectory=/var/lib/node-red
ExecStart=/usr/bin/node-red --userDir /var/lib/node-red
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now nodered
```

Verify the editor at `http://<pi-ip>:1880`.

Install palette modules:

```bash
sudo -u node-red -H bash -c 'cd /var/lib/node-red && npm install node-red-node-mongodb node-red-contrib-mqtt-broker node-red-node-serialport'
sudo systemctl restart nodered
```

## 6. Gateway: MongoDB

```bash
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-7.0.gpg --dearmor
echo "deb [signed-by=/usr/share/keyrings/mongodb-7.0.gpg] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install -y mongodb-org

sudo systemctl enable --now mongod
```

Bind to localhost only (`/etc/mongod.conf`):

```yaml
net:
  port: 27017
  bindIp: 127.0.0.1
```

Restart:

```bash
sudo systemctl restart mongod
```

Create the database, user, and indexes:

```bash
mongosh <<'EOF'
use iot_secure_sentinel
db.createCollection("telemetry")
db.createCollection("alarm")
db.createCollection("securityEvent")
db.createCollection("outbox")

db.telemetry.createIndex({ deviceId: 1, timestamp: -1 })
db.telemetry.createIndex({ timestamp: 1 }, { expireAfterSeconds: 2592000 })  // 30 d
db.alarm.createIndex({ deviceId: 1, timestamp: -1 })
db.outbox.createIndex({ nextAttemptAt: 1 })
db.securityEvent.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7776000 })  // 90 d

db.createUser({
  user: "iris",
  pwd: "<generate strong password>",
  roles: [ { role: "readWrite", db: "iot_secure_sentinel" } ]
})
EOF
```

Enable authentication in `/etc/mongod.conf`:

```yaml
security:
  authorization: enabled
```

Restart and verify:

```bash
sudo systemctl restart mongod
mongosh -u iris -p --authenticationDatabase iot_secure_sentinel
```

## 7. Gateway: Mosquitto MQTT (with auth)

```bash
sudo apt install -y mosquitto mosquitto-clients
sudo systemctl enable mosquitto
```

Create credentials:

```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd iris-flow
sudo mosquitto_passwd /etc/mosquitto/passwd killswitch
sudo chown mosquitto:mosquitto /etc/mosquitto/passwd
sudo chmod 640 /etc/mosquitto/passwd
```

Create ACL `/etc/mosquitto/acl`:

```
user iris-flow
topic readwrite iot-secure-sentinel/raw
topic readwrite iot-secure-sentinel/telemetry
topic readwrite iot-secure-sentinel/alarm
topic readwrite iot-secure-sentinel/security
topic readwrite iot-secure-sentinel/firewall

user killswitch
topic write iot-secure-sentinel/firewall
```

Configure Mosquitto `/etc/mosquitto/conf.d/iris.conf`:

```
listener 1883 127.0.0.1
allow_anonymous false
password_file /etc/mosquitto/passwd
acl_file /etc/mosquitto/acl
```

Restart:

```bash
sudo systemctl restart mosquitto
```

Verify with two terminals:

```bash
mosquitto_sub -u iris-flow -P '<password>' -t 'iot-secure-sentinel/#' -v
mosquitto_pub -u iris-flow -P '<password>' -t 'iot-secure-sentinel/raw' -m '{"deviceId":"test","temperatureC":22}'
```

## 8. Gateway: import the Node-RED flow

In the Node-RED editor:

1. `Menu → Import → select a file to import`
2. Choose `gateway/flows.json` from the cloned repo
3. Open the MongoDB config node, set host `127.0.0.1`, port `27017`, db `iot_secure_sentinel`, user `iris`, password
4. Open the MQTT broker config node, set host `127.0.0.1:1883`, username `iris-flow`, password
5. Open the input node, switch from the demo inject to your transport (serial for USB, MQTT subscription `iot-secure-sentinel/raw` for radio bridge)
6. Open the cloud forwarder HTTP nodes (planned extension), set base URL to your Vercel URL, e.g. `https://iris.example.app`. The flow loads the `apiToken` and `deviceId` from `/etc/iris-gateway/credentials.json` and sends `Authorization: Bearer dt_...` on every request
7. `Deploy`

The `Demo payload` inject node is a useful sanity check before connecting hardware.

## 9. Gateway: HARDWARIO radio bridge (radio transport)

If the node communicates over radio, install the HARDWARIO bridge service:

```bash
sudo apt install -y python3-pip
sudo pip3 install --break-system-packages bch
sudo bch firmware update gateway-usb-dongle:bcf
sudo systemctl enable --now bcg-mqtt
```

Configure the bridge to publish to topic `iot-secure-sentinel/raw` with credentials `iris-flow` (edit `/etc/bcg-mqtt/bcg-mqtt.yml`).

For USB CDC, point the Node-RED `serial` input node at `/dev/ttyACM0`.

## 10. Sensor node firmware

From your workstation:

```bash
cd hw-node
# Install HARDWARIO toolchain (one-time)
# https://tower.hardwario.com/en/latest/firmware/toolchain.html

make
make dfu  # node in DFU mode (hold button while inserting USB)
```

Verify on the gateway:

```bash
mosquitto_sub -u iris-flow -P '<password>' -t 'iot-secure-sentinel/raw' -v
```

You should see telemetry frames every 60 seconds.

## 11. Register the gateway and node with the cloud

Issue a registration token from the dashboard at `/settings/registration-tokens` (admin only). Copy the token (shown once). Repeat for each device (gateway + each sensor node).

On the gateway, register itself:

```bash
curl -X POST https://iris.example.app/api/device/register \
  -H 'Content-Type: application/json' \
  -d '{
    "registrationToken": "rt_5f7a9c1e3d4b6a8c0e2f4d6b8a0c2e4f",
    "name": "iris-gw-001",
    "type": "gateway",
    "location": "Building 4, floor -1",
    "ipAddress": "192.168.1.50",
    "firmwareVersion": "1.0.0"
  }'
```

The response contains the assigned `deviceId` (Mongo ObjectId) and the API token (returned exactly once). Store both in `/etc/iris-gateway/credentials.json`:

```json
{
  "baseUrl": "https://iris.example.app",
  "deviceId": "651f2a1b3c4d5e6f7a8b9c0d",
  "apiToken": "dt_5f7a9c1e3d4b6a8c0e2f4d6b8a0c2e4f6d8b0a2c"
}
```

Permissions:

```bash
sudo chmod 600 /etc/iris-gateway/credentials.json
sudo chown node-red:node-red /etc/iris-gateway/credentials.json
```

The Node-RED flow reads this file on startup and uses it as the bearer token for outbound calls (`Authorization: Bearer dt_...`).

Register each sensor node similarly with its own registration token:

```bash
curl -X POST https://iris.example.app/api/device/register \
  -H 'Content-Type: application/json' \
  -d '{
    "registrationToken": "rt_<separate token for the node>",
    "name": "node-01",
    "type": "iotNode",
    "location": "Building 4, vault A",
    "firmwareVersion": "1.0.0"
  }'
```

Then register sensors on each node (one row per physical sensor):

```bash
curl -X POST https://iris.example.app/api/sensor/register \
  -H 'Authorization: Bearer <admin session is preferred via the dashboard>' \
  -H 'Content-Type: application/json' \
  -d '{
    "deviceId": "<node device id from above>",
    "name": "Vault accelerometer",
    "sensorType": "accelerometer",
    "threshold": 1.20,
    "enabled": true
  }'
```

The dashboard `/devices` and `/settings` flows are easier than curl for this step in practice.

## 12. Iteration 2: Suricata IDS

```bash
sudo apt install -y suricata
sudo systemctl enable suricata
```

Configure the IoT subnet interface in `/etc/suricata/suricata.yaml`:

```yaml
af-packet:
  - interface: eth1
    cluster-id: 99
    cluster-type: cluster_flow
    defrag: yes
```

Enable EVE JSON output and feed it into Node-RED:

```bash
sudo tail -f /var/log/suricata/eve.json
```

Add a Node-RED `tail` input on `/var/log/suricata/eve.json`, parse JSON, feed into the rule engine subflow that calls `POST /api/event/create` (with `eventType: "networkAnomaly"`) and `POST /api/firewall/applyRule`. Both calls use the gateway's bearer token from `/etc/iris-gateway/credentials.json`.

Suricata runs in IDS mode (passive sniffing). Block decisions are taken by Node-RED + iptables. Expected detect-to-block latency budget: under 30 seconds.

## 13. Iteration 2: firewall (default-deny)

Enable IP forwarding for the IoT subnet and a default-deny ruleset:

```bash
sudo sysctl -w net.ipv4.ip_forward=1
sudo tee /etc/sysctl.d/99-iris.conf <<'EOF'
net.ipv4.ip_forward=1
EOF

# Default policy: drop everything not explicitly allowed
sudo iptables -P FORWARD DROP

# Drop invalid packets up front
sudo iptables -A FORWARD -m conntrack --ctstate INVALID -j DROP

# Allow established/related (return path)
sudo iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow specific egress from IoT subnet → uplink
sudo iptables -A FORWARD -i eth1 -o eth0 -p udp --dport 53 -j ACCEPT       # DNS
sudo iptables -A FORWARD -i eth1 -o eth0 -p udp --dport 123 -j ACCEPT      # NTP
# Per-device allow-list for known IoT devices (example):
# sudo iptables -A FORWARD -i eth1 -o eth0 -s 192.168.50.10 -d <vendor.cloud> -j ACCEPT

# Persist
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

When Suricata or the kill switch decides to block a host, the Node-RED rule engine inserts the rule **at the top** of the FORWARD chain so it takes precedence over the established/related rule:

```bash
sudo iptables -I FORWARD 1 -s 192.168.50.41 -j DROP
sudo iptables -I FORWARD 1 -d 192.168.50.41 -j DROP
```

The rule engine also revokes the rule when `firewallRule.expiresAt` passes (the cloud cron tick triggers the gateway to revert via a status pull, or the gateway sweeps locally).

## 14. Iteration 2: kill switch

```bash
sudo apt install -y python3-gpiozero python3-paho-mqtt
```

Create `/opt/iris/killswitch.py`:

```python
from gpiozero import Button
import paho.mqtt.publish as publish
import subprocess
import json

PAYLOAD = json.dumps({
    "target": "192.168.50.0/24",
    "action": "block",
    "reason": "manualKillSwitch",
    "triggeredBy": "killSwitch",
})

def lockdown():
    try:
        publish.single(
            "iot-secure-sentinel/firewall",
            payload=PAYLOAD,
            hostname="127.0.0.1",
            auth={"username": "killswitch", "password": "<password>"},
        )
    except Exception:
        # MQTT down: apply iptables directly as a fallback
        subprocess.run(["sudo", "iptables", "-I", "FORWARD", "1", "-s", "192.168.50.0/24", "-j", "DROP"])
        subprocess.run(["sudo", "iptables", "-I", "FORWARD", "1", "-d", "192.168.50.0/24", "-j", "DROP"])

button = Button(17, hold_time=2)
button.when_held = lockdown
button.wait_for_press()
```

Install as a systemd service running as the `iris-gateway` user with sudoers entry restricted to `iptables -I FORWARD 1 ...`.

## 15. Health check after deployment

| Check                                          | Expected outcome                                       |
| ---------------------------------------------- | ------------------------------------------------------ |
| Vercel deploy URL                              | dashboard renders, login works                         |
| `GET /api/health` on Vercel                    | `{ "status": "ok", "db": "ok", "version": "..." }`     |
| Vercel Cron logs after 1 minute                | `/api/cron/tick` returns 200                           |
| `systemctl is-active mongod nodered mosquitto` | all `active`                                           |
| `mosquitto_sub -u iris-flow ... -t 'iot-secure-sentinel/#'` | telemetry frames every 60 s               |
| Node-RED debug sidebar                         | `telemetry` and (when triggered) `alarm` documents     |
| Vercel logs after gateway POST                 | `/api/telemetry` 201, `/api/alarm` 201                 |
| Cloud dashboard                                | gateway visible, last seen recent, latest telemetry    |
| Trigger an alarm by tapping the node           | alarm appears on dashboard within 5 s (polling)        |

## 16. Backup

### Cloud database (Atlas)

Atlas M0 includes basic snapshots. For point-in-time recovery upgrade to M10. For a free-tier off-site backup, schedule a daily `mongodump` via GitHub Actions and encrypt before upload:

```yaml
name: db-backup
on:
  schedule:
    - cron: "0 3 * * *"
jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Mongo tools
        run: |
          curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-7.0.gpg --dearmor
          echo "deb [signed-by=/usr/share/keyrings/mongodb-7.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
          sudo apt update && sudo apt install -y mongodb-database-tools
      - run: |
          mongodump --uri="$MONGODB_URI" --archive=backup.archive --gzip
          openssl enc -aes-256-gcm -pbkdf2 -in backup.archive -out backup.archive.enc -pass env:BACKUP_PASS
        env:
          MONGODB_URI: ${{ secrets.MONGODB_URI }}
          BACKUP_PASS: ${{ secrets.BACKUP_PASS }}
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-central-1
      - run: aws s3 cp backup.archive.enc s3://iris-backups/$(date +%F).archive.enc --sse AES256
```

### Gateway local Mongo

Daily dump to a USB drive mounted at `/mnt/backup`:

```bash
sudo crontab -e
# 0 3 * * * mongodump --uri='mongodb://iris:<pwd>@127.0.0.1/iot_secure_sentinel' --out /mnt/backup/$(date +\%F)
```

Keep 14 days, prune older.

## 17. Update procedure

Cloud:

```bash
git push origin main      # Vercel auto-deploys preview, then promotes on merge
```

Mongoose schema changes apply on next connection (ad-hoc additive changes are safe; index changes require `Model.syncIndexes()` in a one-shot script).

Gateway flow:

1. Pull the new `gateway/flows.json`
2. Import in Node-RED (`Import → replace existing`)
3. Redeploy

Firmware:

1. Build new firmware on the workstation
2. SCP the binary to the Pi
3. `bch firmware flash <path>` if the node is connected via USB
4. OTA over radio is out of scope for MVP

### Rollback

Cloud: `vercel rollback <deployment-url>` rolls the production alias to a previous build.
Gateway flow: Node-RED keeps a `flows_backup.json`; `Menu → Import → replace existing` from that file.

## 18. Troubleshooting

| Symptom                                           | First check                                                |
| ------------------------------------------------- | ---------------------------------------------------------- |
| No telemetry in Node-RED                          | Mosquitto running? Bridge service active? Topic correct? Mosquitto auth credentials right? |
| MongoDB `connect ECONNREFUSED`                    | `systemctl status mongod`                                  |
| Cloud `INVALID_TOKEN` on register                 | token expired (24 h) or already used; issue a new one      |
| Cloud `TIMESTAMP_IN_FUTURE`                       | gateway clock drift; check `chronyc tracking`              |
| Cloud `unauthorized` on event/heartbeat POST      | API token mismatch (re-register), or device removed in cloud   |
| High alarm visibility latency (> 10 s)            | TanStack Query polling interval correct? Mongo writes slow? Network round-trip? |
| Vercel build fails                                | check `MONGODB_URI` env var; check `bun install` logs      |
| Atlas connection times out from Vercel            | confirm Atlas Network Access allows `0.0.0.0/0`            |
| Suricata high packet drop                         | reduce ruleset, improve Pi cooling, or upgrade host        |
| iptables rule not blocking                        | confirm rule is in FORWARD chain at position 1 (`iptables -L FORWARD --line-numbers`) |

## 19. Security checklist

- [ ] MongoDB on Pi binds to `127.0.0.1` only, requires authentication
- [ ] Atlas: strong DB user password, IP allowlist (or `0.0.0.0/0` with strong password)
- [ ] Mosquitto requires authentication; ACL restricts `iot-secure-sentinel/firewall` to two publishers
- [ ] API token in `/etc/iris-gateway/credentials.json` is `chmod 600`, owned by `node-red:node-red`
- [ ] Cloud Atlas connection uses TLS (default in connection string)
- [ ] `AUTH_SECRET` is at least 32 bytes, generated per environment
- [ ] `CRON_SECRET` is at least 32 bytes
- [ ] User passwords hashed with Argon2id (memory cost 64 MB, time cost 3, parallelism 1)
- [ ] Device API tokens stored as SHA-256 hex digest, compared with `crypto.timingSafeEqual`
- [ ] HTTPS enforced for all device → cloud calls (TLS terminates the bearer token)
- [ ] Default user role is `reader`; admin must explicitly elevate
- [ ] Pi management interface reachable only from admin VLAN
- [ ] IoT subnet (`eth1`) has no direct internet route; FORWARD policy is DROP with explicit allow-list
- [ ] iptables IDS/kill-switch rules use `-I FORWARD 1` to insert at top
- [ ] Node-RED runs as a dedicated `node-red` system user, not root
- [ ] Backups encrypted at source, S3 bucket has SSE-KMS and Block Public Access
- [ ] Backups verified with a quarterly restore test
- [ ] HARDWARIO radio: per-node HMAC + monotonic counter is on the iter-2 roadmap (open question in `iot_design.md`)
- [ ] Device API token rotation procedure documented (re-register on suspected compromise)
