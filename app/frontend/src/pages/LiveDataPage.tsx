import {
  Alert,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
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
  value: number | null;
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
    .replace(/\bfloor\s*(\d+)\b/gi, 'Floor $1')
    .replace(/\broom\s*(\d+)\b/gi, 'Room $1')
    .replace(/\bfire exit\s*(\d+)\b/gi, 'Fire Exit $1')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatScalar(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true') return 'On';
    if (lowered === 'false') return 'Off';
  }
  return typeof value === 'object' ? '' : String(value);
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
  const value = toNumber(type === 'flame' ? payload.intensity : payload.value);
  const detected = toBoolean(payload.detected);
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
    value,
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

  return readings.sort(
    (a, b) =>
      ({ critical: 0, warning: 1, normal: 2 })[a.severity] -
        ({ critical: 0, warning: 1, normal: 2 })[b.severity] ||
      new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
  );
}

function renderPropertyList(value: unknown) {
  const entries = recordEntries(value).filter(([, entry]) => typeof entry !== 'object');
  if (entries.length === 0) {
    return <Typography color="text.secondary">No details yet.</Typography>;
  }

  return (
    <Stack spacing={1}>
      {entries.slice(0, 6).map(([key, entry]) => (
        <Stack key={key} direction="row" justifyContent="space-between" spacing={2}>
          <Typography color="text.secondary" variant="body2">
            {formatLabel(key)}
          </Typography>
          <Typography variant="body2" sx={{ textAlign: 'right', overflowWrap: 'anywhere' }}>
            {formatScalar(entry)}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function renderJsonPreview(title: string, value: unknown) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography sx={{ fontWeight: 700, mb: 1 }}>{title}</Typography>
        {value ? (
          <Typography
            component="pre"
            variant="body2"
            sx={{ m: 0, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' }}
          >
            {JSON.stringify(value, null, 2)}
          </Typography>
        ) : (
          <Typography color="text.secondary">No data yet.</Typography>
        )}
      </CardContent>
    </Card>
  );
}

function sensorStatus(reading: SensorReading): string {
  if (reading.type === 'flame') return reading.detected ? 'Fire detected' : 'No flame';
  if (reading.type === 'gas') return reading.detected ? 'Gas detected' : 'Gas normal';
  if (reading.type === 'temperature') return reading.value !== null && reading.value > 40 ? 'High temperature' : 'Temperature normal';
  return 'Reading received';
}

function sensorValue(reading: SensorReading): string {
  if (reading.type === 'temperature') {
    const temp = reading.value !== null ? `${reading.value.toFixed(1)} C` : 'No value';
    const humidity = reading.humidity !== null ? `Humidity ${reading.humidity.toFixed(1)}%` : 'No humidity';
    return `${temp} | ${humidity}`;
  }
  if (reading.type === 'gas') return reading.value !== null ? `Level ${Math.round(reading.value)}` : 'No level';
  if (reading.type === 'flame') return reading.value !== null ? `Intensity ${Math.round(reading.value)}` : 'No intensity';
  return 'No parsed value';
}

function chipColor(severity: SensorSeverity): 'error' | 'warning' | 'success' {
  if (severity === 'critical') return 'error';
  if (severity === 'warning') return 'warning';
  return 'success';
}

export function LiveDataPage() {
  const { overview, overviewLoading, overviewError, events, eventsLoading, eventsError, subscribeOverview, subscribeEvents } =
    useDashboardStore();

  useEffect(() => {
    const unsubscribeOverview = subscribeOverview();
    const unsubscribeEvents = subscribeEvents();
    return () => {
      unsubscribeOverview();
      unsubscribeEvents();
    };
  }, [subscribeEvents, subscribeOverview]);

  const floorDevices = recordEntries(overview.devices);
  const occupancyEntries = recordEntries(overview.occupancy);
  const elevatorFloors = recordEntries(overview.elevators);
  const evacuationState = asRecord(overview.evacuation);
  const sensorReadings = normalizeSensors(overview.sensors);
  const alertReadings = sensorReadings.filter((reading) => reading.severity !== 'normal');
  const sensorsByFloor = sensorReadings.reduce<Record<string, SensorReading[]>>((map, reading) => {
    map[reading.floor] ??= [];
    map[reading.floor].push(reading);
    return map;
  }, {});

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="overline" color="info.light">
          Realtime Monitoring
        </Typography>
        <Typography variant="h3" sx={{ fontSize: { xs: '2rem', md: '3rem' }, lineHeight: 1 }}>
          Live building activity
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 780, mt: 1 }}>
          This page now normalizes your current Firebase data shape so floor sensors, room flame sensors, and raw snapshots can all show without changing backend topics.
        </Typography>
      </div>

      {overviewError ? <Alert severity="error">{overviewError}</Alert> : null}
      {eventsError ? <Alert severity="error">{eventsError}</Alert> : null}

      <Grid container spacing={2}>
        {[
          ['Device Floors', floorDevices.length],
          ['Live Sensors', sensorReadings.length],
          ['Active Alerts', alertReadings.length],
          ['Recent Events', events.length],
        ].map(([label, value]) => (
          <Grid key={label} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography color="text.secondary" variant="body2">
                  {label}
                </Typography>
                <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                  {value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 8 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <Card>
                <CardContent>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
                    <Typography variant="h6">Sensor readings by floor</Typography>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      <Chip label={`${Object.keys(sensorsByFloor).length} floors`} size="small" variant="outlined" />
                      <Chip label={`${sensorReadings.length} readings`} size="small" color="info" variant="outlined" />
                      <Chip label={`${alertReadings.length} alerts`} size="small" color={alertReadings.length > 0 ? 'warning' : 'success'} variant="outlined" />
                    </Stack>
                  </Stack>
                  {sensorReadings.length === 0 ? (
                    <Typography color="text.secondary">No sensor readings have been written yet.</Typography>
                  ) : (
                    <Grid container spacing={2}>
                      {Object.entries(sensorsByFloor).map(([floor, readings]) => (
                        <Grid key={floor} size={{ xs: 12, md: 6, xl: 4 }}>
                          <Card variant="outlined" sx={{ height: '100%' }}>
                            <CardContent>
                              <Typography sx={{ fontWeight: 700, mb: 1.5 }}>{formatLabel(floor)}</Typography>
                              <Stack spacing={1.5}>
                                {readings.slice(0, 6).map((reading) => (
                                  <Card key={reading.id} variant="outlined">
                                    <CardContent>
                                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                                        <Typography sx={{ fontWeight: 600 }}>
                                          {reading.placeId === reading.floor ? `${formatLabel(reading.floor)} floor sensor` : `${formatLabel(reading.floor)} | ${formatLabel(reading.placeId)}`}
                                        </Typography>
                                        <Chip label={formatLabel(reading.type)} size="small" color={chipColor(reading.severity)} />
                                      </Stack>
                                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                        {sensorStatus(reading)}
                                      </Typography>
                                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                                        {sensorValue(reading)}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                        Updated: {formatDateTime(reading.updatedAt)}
                                      </Typography>
                                    </CardContent>
                                  </Card>
                                ))}
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
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="h6">Devices by floor</Typography>
                    {overviewLoading ? <CircularProgress size={20} /> : null}
                  </Stack>
                  {floorDevices.length === 0 ? (
                    <Typography color="text.secondary">No device status data yet.</Typography>
                  ) : (
                    <Stack spacing={1.5}>
                      {floorDevices.map(([floor, devices]) => {
                        const deviceEntries = recordEntries(devices);
                        return (
                          <Card key={floor} variant="outlined">
                            <CardContent>
                              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25 }}>
                                <Typography sx={{ fontWeight: 700 }}>{formatLabel(floor)}</Typography>
                                <Chip label={`${deviceEntries.length} devices`} size="small" color="primary" variant="outlined" />
                              </Stack>
                              <Stack spacing={1}>
                                {deviceEntries.slice(0, 4).map(([deviceId, payload]) => {
                                  const data = asRecord(payload);
                                  const status = formatScalar(data?.status);
                                  return (
                                    <Stack key={deviceId} direction="row" justifyContent="space-between" spacing={1}>
                                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                                        {deviceId}
                                      </Typography>
                                      <Chip label={status} size="small" color={String(status).toLowerCase() === 'online' ? 'success' : 'default'} />
                                    </Stack>
                                  );
                                })}
                              </Stack>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    Occupancy summary
                  </Typography>
                  {occupancyEntries.length === 0 ? (
                    <Typography color="text.secondary">No occupancy data yet.</Typography>
                  ) : (
                    <Stack spacing={1.5}>
                      {occupancyEntries.map(([key, value]) => (
                        <Card key={key} variant="outlined">
                          <CardContent>
                            <Typography sx={{ fontWeight: 700, mb: 1 }}>{formatLabel(key)}</Typography>
                            {renderPropertyList(value)}
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    Raw Firebase snapshots
                  </Typography>
                  <Typography color="text.secondary" sx={{ mb: 2 }}>
                    This keeps the current backend and controller contracts intact while still showing any shape that lands in Firebase.
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      {renderJsonPreview('Sensors', overview.sensors)}
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      {renderJsonPreview('Devices', overview.devices)}
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      {renderJsonPreview('Occupancy', overview.occupancy)}
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      {renderJsonPreview('Elevators', overview.elevators)}
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>

        <Grid size={{ xs: 12, xl: 4 }}>
          <Stack spacing={2}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Active sensor alerts
                </Typography>
                {alertReadings.length === 0 ? (
                  <Typography color="text.secondary">
                    No active flame, gas, or high-temperature alerts right now.
                  </Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {alertReadings.map((reading) => (
                      <Card key={reading.id} variant="outlined">
                        <CardContent>
                          <Stack direction="row" justifyContent="space-between" spacing={1}>
                            <Typography sx={{ fontWeight: 700 }}>{sensorStatus(reading)}</Typography>
                            <Chip label={formatLabel(reading.type)} size="small" color={chipColor(reading.severity)} />
                          </Stack>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            {reading.placeId === reading.floor ? `${formatLabel(reading.floor)} floor sensor` : `${formatLabel(reading.floor)} | ${formatLabel(reading.placeId)}`}
                          </Typography>
                          <Typography variant="body2" sx={{ mt: 0.75 }}>
                            {sensorValue(reading)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            Updated: {formatDateTime(reading.updatedAt)}
                          </Typography>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Evacuation state
                </Typography>
                {evacuationState ? renderPropertyList(evacuationState) : <Typography color="text.secondary">No evacuation command has been recorded yet.</Typography>}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Elevator state
                </Typography>
                {elevatorFloors.length === 0 ? (
                  <Typography color="text.secondary">No elevator state data yet.</Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {elevatorFloors.map(([floor, value]) => {
                      const nestedEntries = recordEntries(value);
                      return (
                        <Card key={floor} variant="outlined">
                          <CardContent>
                            <Typography sx={{ fontWeight: 700, mb: 1 }}>{formatLabel(floor)}</Typography>
                            {nestedEntries.map(([key, nested], index) => (
                              <Stack key={key} spacing={1} sx={{ mt: 1 }}>
                                <Typography variant="body2" color="text.secondary">
                                  {formatLabel(key)}
                                </Typography>
                                {renderPropertyList(nested)}
                                {index < nestedEntries.length - 1 ? <Divider /> : null}
                              </Stack>
                            ))}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Stack>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Recent sensor events
                </Typography>
                {eventsLoading ? <CircularProgress size={20} /> : null}
                <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                  {events.map((event) => (
                    <Card key={event.id} variant="outlined">
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" spacing={1}>
                          <Typography variant="subtitle2">{event.message ?? event.eventType ?? 'Sensor event'}</Typography>
                          <Chip size="small" label={event.sensorType ?? 'unknown'} color="primary" variant="outlined" />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, overflowWrap: 'anywhere' }}>
                          Floor: {event.floor ?? '-'} | Place: {event.placeId ?? '-'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {event.createdAt ?? 'No timestamp'}
                        </Typography>
                      </CardContent>
                    </Card>
                  ))}
                  {!eventsLoading && events.length === 0 ? (
                    <Card variant="outlined">
                      <CardContent>
                        <Typography sx={{ fontWeight: 600 }}>No events yet</Typography>
                        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                          Firestore is connected, but the `sensor_events` collection has not received any records yet.
                        </Typography>
                      </CardContent>
                    </Card>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
