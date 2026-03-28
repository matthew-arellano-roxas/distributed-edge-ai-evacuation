import {
  Alert,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect } from 'react';
import { useDashboardStore } from '../store/useDashboardStore';

type RecordValue = Record<string, unknown>;
type SensorSeverity = 'critical' | 'warning' | 'normal';
type SensorReading = {
  id: string;
  floor: string;
  placeId: string;
  type: string;
  severity: SensorSeverity;
  updatedAt: string | null;
  humidity: number | null;
  detected: boolean | null;
};

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' ? (value as RecordValue) : null;
}

function recordEntries(value: unknown): Array<[string, unknown]> {
  const record = asRecord(value);
  return record ? Object.entries(record) : [];
}

function formatLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\broom\s*(\d+)\b/gi, 'Room $1')
    .replace(/\bfire exit\s*(\d+)\b/gi, 'Fire Exit $1')
    .replace(/\bfloor\s*(\d+)\b/gi, 'Floor $1')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Waiting for update';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isSensorPayload(value: unknown): value is RecordValue {
  const record = asRecord(value);
  return Boolean(record && typeof record.type === 'string');
}

function normalizeSensorType(sensorKey: string, payloadType: unknown): string {
  const normalized = String(payloadType ?? sensorKey).toLowerCase();
  if (sensorKey === 'gas' || normalized === 'mq2' || normalized === 'gas') return 'gas';
  return normalized;
}

function createReading(
  floor: string,
  placeId: string,
  sensorKey: string,
  payload: RecordValue,
): SensorReading {
  const type = normalizeSensorType(sensorKey, payload.type);
  const detected = toBoolean(
    type === 'flame' ? payload.detected ?? payload.isFlameDetected : payload.detected ?? payload.isDetected,
  );
  const value = type === 'temperature' ? toNumber(payload.value ?? payload.temperature) : null;
  const severity: SensorSeverity =
    type === 'flame' && detected
      ? 'critical'
      : type === 'gas' && detected
        ? 'warning'
        : type === 'temperature' && value !== null && value > 40
          ? 'warning'
          : 'normal';

  return {
    id: `${floor}:${placeId}:${sensorKey}`,
    floor,
    placeId,
    type,
    severity,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
    humidity: toNumber(payload.humidity),
    detected,
  };
}

function normalizeSensors(value: unknown): SensorReading[] {
  const readings: SensorReading[] = [];

  for (const [floor, floorData] of recordEntries(value)) {
    for (const [branchKey, branchValue] of recordEntries(floorData)) {
      if (isSensorPayload(branchValue)) {
        readings.push(createReading(floor, floor, branchKey, branchValue));
        continue;
      }

      for (const [sensorKey, sensorValue] of recordEntries(branchValue)) {
        if (isSensorPayload(sensorValue)) {
          readings.push(createReading(floor, branchKey, sensorKey, sensorValue));
        }
      }
    }
  }

  return readings.sort((a, b) =>
    `${a.floor}:${a.placeId}:${a.type}`.localeCompare(`${b.floor}:${b.placeId}:${b.type}`),
  );
}

function getLatestDevices(
  value: unknown,
): Array<{ id: string; floor: string; status: string; deviceType: string }> {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([id, raw]) => {
      const entry = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      return {
        id,
        floor: String(entry.floor ?? '-'),
        status: String(entry.status ?? 'unknown'),
        deviceType: String(entry.deviceType ?? 'device'),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function sensorStatus(reading: SensorReading): string {
  if (reading.type === 'flame') return reading.detected ? 'Fire detected' : 'No fire';
  if (reading.type === 'gas') return reading.detected ? 'Gas detected' : 'Gas normal';
  if (reading.type === 'temperature') return 'Temperature sensor active';
  return 'Reading received';
}

function secondaryStatus(reading: SensorReading): string {
  if (reading.type === 'temperature') {
    return reading.humidity !== null ? `Humidity ${reading.humidity.toFixed(1)}%` : 'No humidity';
  }
  return formatDateTime(reading.updatedAt);
}

function chipColor(severity: SensorSeverity): 'error' | 'warning' | 'success' {
  if (severity === 'critical') return 'error';
  if (severity === 'warning') return 'warning';
  return 'success';
}

export function LiveDataPage() {
  const {
    overview,
    overviewLoading,
    overviewError,
    events,
    eventsError,
    subscribeOverview,
    subscribeEvents,
  } = useDashboardStore();

  useEffect(() => {
    const unsubscribeOverview = subscribeOverview();
    const unsubscribeEvents = subscribeEvents();
    return () => {
      unsubscribeOverview();
      unsubscribeEvents();
    };
  }, [subscribeEvents, subscribeOverview]);

  const sensorReadings = normalizeSensors(overview.sensors);
  const devices = getLatestDevices(overview.latestDevices);
  const alertReadings = sensorReadings.filter((reading) => reading.severity !== 'normal');
  const floorCount = new Set(sensorReadings.map((reading) => reading.floor)).size;
  const evacuationMode =
    overview.evacuation &&
    typeof overview.evacuation === 'object' &&
    'evacuationMode' in overview.evacuation
      ? String((overview.evacuation as Record<string, unknown>).evacuationMode)
      : 'false';

  return (
    <Stack spacing={3}>
      <Stack spacing={0.75}>
        <Typography variant="overline" color="secondary.main">
          Live Data
        </Typography>
        <Typography variant="h4">Live sensor and device summary</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 700 }}>
          Stable cards, no raw snapshots, and no fire intensity values so the page stays calm
          when data updates quickly.
        </Typography>
      </Stack>

      {overviewError ? <Alert severity="error">{overviewError}</Alert> : null}
      {eventsError ? <Alert severity="error">{eventsError}</Alert> : null}

      <Grid container spacing={2}>
        {[
          ['Devices', devices.length],
          ['Sensors', sensorReadings.length],
          ['Alerts', alertReadings.length],
          ['Floors', floorCount],
        ].map(([label, value]) => (
          <Grid key={label} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="h4" sx={{ mt: 1 }}>
                  {value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                spacing={1}
                sx={{ mb: 2 }}
              >
                <Typography variant="h6">Sensor status</Typography>
                <Chip
                  label={overviewLoading ? 'Syncing' : 'Live'}
                  color={overviewLoading ? 'default' : 'success'}
                  variant="outlined"
                />
              </Stack>

              {sensorReadings.length === 0 ? (
                <Typography color="text.secondary">No sensor data has arrived yet.</Typography>
              ) : (
                <Grid container spacing={2}>
                  {sensorReadings.slice(0, 8).map((reading) => (
                    <Grid key={reading.id} size={{ xs: 12, md: 6 }}>
                      <Card variant="outlined" sx={{ height: '100%' }}>
                        <CardContent>
                          <Stack spacing={1.25}>
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              spacing={1}
                              alignItems="flex-start"
                            >
                              <Typography sx={{ fontWeight: 700 }}>
                                {reading.placeId === reading.floor
                                  ? formatLabel(reading.floor)
                                  : `${formatLabel(reading.floor)} | ${formatLabel(reading.placeId)}`}
                              </Typography>
                              <Chip
                                label={formatLabel(reading.type === 'flame' ? 'fire' : reading.type)}
                                color={chipColor(reading.severity)}
                                size="small"
                              />
                            </Stack>
                            <Typography>{sensorStatus(reading)}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {secondaryStatus(reading)}
                            </Typography>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Stack spacing={2}>
            <Card>
              <CardContent>
                <Typography variant="h6">Devices</Typography>
                {devices.length === 0 ? (
                  <Typography color="text.secondary" sx={{ mt: 2 }}>
                    No devices reported yet.
                  </Typography>
                ) : (
                  <Stack spacing={1.25} sx={{ mt: 2 }}>
                    {devices.slice(0, 6).map((device) => (
                      <Stack key={device.id} spacing={0.25}>
                        <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                          {device.id}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Floor {device.floor} | {device.deviceType} | {device.status}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6">Building status</Typography>
                <Stack spacing={1.25} sx={{ mt: 2 }}>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography color="text.secondary">Evacuation</Typography>
                    <Typography>{evacuationMode === 'true' ? 'Active' : 'Off'}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography color="text.secondary">Events</Typography>
                    <Typography>{events.length}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" spacing={2}>
                    <Typography color="text.secondary">Occupancy entries</Typography>
                    <Typography>{recordEntries(overview.occupancy).length}</Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
