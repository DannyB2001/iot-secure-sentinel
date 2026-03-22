# API Contract

## Prehled

Tento dokument definuje zakladni datovy kontrakt mezi firmware vrstvou, Node-RED gateway a cloudovou uuApp vrstvou.

## 1. Vstupni zprava z node

```json
{
  "deviceId": "node-01",
  "timestamp": "2026-03-22T10:15:00Z",
  "temperatureC": 24.7,
  "accelG": 0.18,
  "alarm": false,
  "batteryVoltage": 2.95,
  "transport": "radio"
}
```

## 2. Validace na gateway

Povinna pole:

- `deviceId`
- `timestamp`
- `temperatureC`
- `accelG`
- `alarm`

Pravidla:

- `temperatureC` musi byt cislo
- `accelG` musi byt cislo
- `alarm` musi byt boolean
- `timestamp` musi byt platny ISO string

## 3. Ulozeny dokument v MongoDB

### Kolekce `telemetry`

```json
{
  "deviceId": "node-01",
  "timestamp": "2026-03-22T10:15:00Z",
  "temperatureC": 24.7,
  "accelG": 0.18,
  "batteryVoltage": 2.95,
  "transport": "radio",
  "type": "telemetry",
  "avgTemperatureC": 24.52
}
```

### Kolekce `alarms`

```json
{
  "deviceId": "node-01",
  "timestamp": "2026-03-22T10:15:05Z",
  "accelG": 1.94,
  "temperatureC": 24.9,
  "batteryVoltage": 2.94,
  "transport": "radio",
  "type": "alarm",
  "priority": "high",
  "message": "Acceleration threshold exceeded"
}
```

## 4. MQTT temata uvnitr gateway

- `iot-secure-sentinel/raw`
- `iot-secure-sentinel/telemetry`
- `iot-secure-sentinel/alarm`

## 5. Navrh cloudoveho requestu pro uuApp

### `telemetry/create`

```json
{
  "awid": "22222222222222222222222222222222",
  "deviceId": "node-01",
  "timestamp": "2026-03-22T10:15:00Z",
  "temperatureC": 24.7,
  "avgTemperatureC": 24.52,
  "accelG": 0.18,
  "transport": "radio"
}
```

### `alarm/create`

```json
{
  "awid": "22222222222222222222222222222222",
  "deviceId": "node-01",
  "timestamp": "2026-03-22T10:15:05Z",
  "temperatureC": 24.9,
  "accelG": 1.94,
  "priority": "high",
  "message": "Acceleration threshold exceeded"
}
```

## 6. Poznamka k uuApp

Kontrakt je pripraveny tak, aby se dal mapovat na uuApp business requesty a DTO struktury bez zmeny vyznamu poli. Presne nazvy use case endpointu lze upravit podle zvolene uuApp sablony projektu.
