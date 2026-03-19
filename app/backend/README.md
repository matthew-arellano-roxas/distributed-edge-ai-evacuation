# Smart Building Backend

Node.js and TypeScript backend for the smart building evacuation prototype.

This service connects the application layer, MQTT broker, Firebase, and realtime control routes used during simulation and evacuation workflows.

## What It Does

- subscribes to MQTT sensor, occupancy, elevator, and device-status topics
- stores latest sensor and device state in Firebase Realtime Database
- stores sensor event history in Firestore
- exposes HTTP routes for evacuation commands, elevator state, and simulation reset
- publishes MQTT commands and alerts for evacuation-related actions

## Tech Stack

- Node.js
- TypeScript
- Express
- MQTT
- Firebase Admin SDK
- Redis
- Socket.IO
- Zod
- Vitest

## Project Structure

```text
app/backend/
|-- config/                 # Environment loading, Firebase, Redis, logger, MQTT wrapper
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
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app/
```

Optional:

```env
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173
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
- `building/elevator`
- `building/evacuation/actions`
- `building/evacuation/alerts`

## HTTP Routes

- `POST /elevator/state`
- `POST /evacuation/trigger`
- `DELETE /simulation/reset`

### Example: Trigger evacuation

```http
POST /evacuation/trigger
Content-Type: application/json

{
  "openDoors": true,
  "soundAlert": true
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

## Data Flow

1. Devices publish MQTT messages.
2. The backend receives and routes messages through `MqttService`.
3. Handlers persist current state to Firebase Realtime Database.
4. Alert-worthy sensor readings also create Firestore `sensor_events` records.
5. Routes can publish manual evacuation and control commands back to MQTT.

## Notes

- latest device and sensor state are stored in Realtime Database
- event-style history is stored in Firestore
- device connectivity uses heartbeat and `lastSeen`

