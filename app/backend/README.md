# Smart Building Backend

Node.js and TypeScript backend for the smart building evacuation prototype.

This service connects the application layer, MQTT broker, Redis-backed live state, and realtime control routes used during simulation and evacuation workflows.

## What It Does

- subscribes to MQTT sensor, occupancy, elevator, and device-status topics
- stores latest sensor, device, occupancy, evacuation, and elevator state in Redis
- stores recent sensor event history in Redis
- exposes HTTP routes for evacuation commands, elevator state, and simulation reset
- publishes MQTT commands and alerts for evacuation-related actions

## Tech Stack

- Node.js
- TypeScript
- Express
- MQTT
- Redis
- Socket.IO
- Zod
- Vitest

## Project Structure

```text
app/backend/
|-- config/                 # Environment loading, Redis, logger, MQTT wrapper
|-- src/
|   |-- commands/           # Shared command types and topic constants
|   |-- errors/             # App-specific error classes
|   |-- helpers/            # MQTT handlers and persistence logic
|   |-- middleware/         # Express middleware and async handler
|   |-- routes/             # HTTP routes for simulation and controls
|   |-- sensors_monitoring/ # MQTT wildcard topics for sensors
|   |-- services/           # MQTT service
|   |-- types/              # Shared payload and record types
|   `-- server.ts           # Backend entry point
|-- SensorTester/           # Simple sensor-publish helper sketch
|-- package.json
`-- README.md
```

## Environment Variables

Create `.env.development` or `.env.production` in `app/backend/`.

Required values:

```env
PORT=3000
MQTT_URL=mqtt://localhost:1883
REDIS_URL=redis://127.0.0.1:6379
```

Optional:

```env
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080
MQTT_USERNAME=
MQTT_PASSWORD=
```

## Run Locally

Install dependencies:

```bash
cd app/backend
npm install
```

Start development mode:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Run production build:

```bash
npm start
```

## Tests

Run tests in watch mode:

```bash
npm test
```

Run tests once:

```bash
npm run test:run
```

## MQTT Topics

Examples of active topic groups:

- `building/sensors/{floor}/{placeId}/{sensorType}`
- `building/devices/{floor}/{deviceId}`
- `building/occupancy/{floor}`
- `building/state/{floor}/elevator`
- `building/control/{floor}/{component}`
- `building/command/evacuation`
- `building/evacuation/alerts`

## HTTP Routes

- `POST /elevator/control`
- `POST /evacuation/trigger`
- `DELETE /simulation/reset`

### Example: Trigger evacuation

```http
POST /evacuation/trigger
Content-Type: application/json

{
  "evacuationMode": true,
  "sourceFloor": "floor1",
  "sourceLocation": "room101",
  "targetFloors": ["floor2", "floor3"]
}
```

### Example: Reset simulation data

```http
DELETE /simulation/reset
Content-Type: application/json

{
  "target": "both"
}
```

Valid reset targets:

- `realtime`
- `firestore`
- `both`

All reset targets clear the backend live-state cache in the current implementation.

## Data Flow

1. Devices publish MQTT messages.
2. The backend receives and routes messages through `MqttService`.
3. Handlers persist current state into the Redis-backed dashboard cache.
4. Alert-worthy sensor readings also append recent event records in the cache.
5. Routes can publish manual evacuation and control commands back to MQTT.

## Notes

- latest device and sensor state are stored in Redis-backed dashboard state
- recent event-style history is stored in Redis-backed dashboard state
- device connectivity uses heartbeat and `lastSeen`
