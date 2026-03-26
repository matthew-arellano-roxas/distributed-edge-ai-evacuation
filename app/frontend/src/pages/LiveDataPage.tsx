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
  if (typeof value === 'object') return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const lowered = trimmed.toLowerCase();

    if (lowered === 'true') return 'On';
    if (lowered === 'false') return 'Off';
    if (/^floor\d+$/i.test(trimmed)) {
      return trimmed.replace(/^floor(\d+)$/i, 'Floor $1');
    }
    if (/^(room|fire-exit|fire_exit)[-_]?\d+$/i.test(trimmed)) {
      return formatLabel(trimmed);
    }

    return trimmed;
  }
  return String(value);
}

function renderPropertyList(data: unknown) {
  const entries = recordEntries(data).filter(([, value]) => typeof value !== 'object');

  if (entries.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        No details yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      {entries.slice(0, 6).map(([key, value]) => (
        <Stack
          key={key}
          direction="row"
          justifyContent="space-between"
          spacing={2}
        >
          <Typography variant="body2" color="text.secondary">
            {formatLabel(key)}
          </Typography>
          <Typography
            variant="body2"
            sx={{ textAlign: 'right', overflowWrap: 'anywhere' }}
          >
            {formatScalar(value)}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export function LiveDataPage() {
  const {
    overview,
    overviewLoading,
    overviewError,
    events,
    eventsLoading,
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

  const floorDevices = recordEntries(overview.devices);
  const latestDevices = recordEntries(overview.latestDevices);
  const sensorFloors = recordEntries(overview.sensors);
  const occupancyEntries = recordEntries(overview.occupancy);
  const elevatorFloors = recordEntries(overview.elevators);
  const evacuationState = asRecord(overview.evacuation);

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="overline" color="info.light">
          Realtime Monitoring
        </Typography>
        <Typography
          variant="h3"
          sx={{ fontSize: { xs: '2rem', md: '3rem' }, lineHeight: 1 }}
        >
          Live building activity
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 780, mt: 1 }}>
          A readable view of your Firebase live data for devices, sensors,
          occupancy, evacuation state, and elevators.
        </Typography>
      </div>

      {overviewError ? <Alert severity="error">{overviewError}</Alert> : null}
      {eventsError ? <Alert severity="error">{eventsError}</Alert> : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Device Floors
              </Typography>
              <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                {floorDevices.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Latest Devices
              </Typography>
              <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                {latestDevices.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Sensor Groups
              </Typography>
              <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                {sensorFloors.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Recent Events
              </Typography>
              <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                {events.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 8 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 2 }}
                  >
                    <Typography variant="h6">Devices by floor</Typography>
                    {overviewLoading ? <CircularProgress size={20} /> : null}
                  </Stack>
                  {floorDevices.length === 0 ? (
                    <Typography color="text.secondary">
                      No device status data yet.
                    </Typography>
                  ) : (
                    <Stack spacing={1.5}>
                      {floorDevices.map(([floor, devices]) => {
                        const deviceEntries = recordEntries(devices);

                        return (
                          <Card key={floor} variant="outlined">
                            <CardContent>
                              <Stack
                                direction="row"
                                justifyContent="space-between"
                                alignItems="center"
                                sx={{ mb: 1.25 }}
                              >
                                <Typography sx={{ fontWeight: 700 }}>
                                  {formatLabel(floor)}
                                </Typography>
                                <Chip
                                  label={`${deviceEntries.length} devices`}
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                />
                              </Stack>
                              <Stack spacing={1}>
                                {deviceEntries.slice(0, 4).map(([deviceId, payload]) => {
                                  const data = asRecord(payload);
                                  const status = formatScalar(data?.status);

                                  return (
                                    <Stack
                                      key={deviceId}
                                      direction="row"
                                      justifyContent="space-between"
                                      spacing={1}
                                    >
                                      <Typography
                                        variant="body2"
                                        sx={{ overflowWrap: 'anywhere' }}
                                      >
                                        {deviceId}
                                      </Typography>
                                      <Chip
                                        label={status}
                                        size="small"
                                        color={
                                          String(status).toLowerCase() === 'online'
                                            ? 'success'
                                            : 'default'
                                        }
                                      />
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
                    <Typography color="text.secondary">
                      No occupancy data yet.
                    </Typography>
                  ) : (
                    <Stack spacing={1.5}>
                      {occupancyEntries.map(([key, value]) => (
                        <Card key={key} variant="outlined">
                          <CardContent>
                            <Typography sx={{ fontWeight: 700, mb: 1 }}>
                              {formatLabel(key)}
                            </Typography>
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
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    Sensor activity by floor
                  </Typography>
                  {sensorFloors.length === 0 ? (
                    <Typography color="text.secondary">
                      No sensor readings have been written yet.
                    </Typography>
                  ) : (
                    <Grid container spacing={2}>
                      {sensorFloors.map(([floor, floorData]) => (
                        <Grid key={floor} size={{ xs: 12, md: 6, xl: 4 }}>
                          <Card variant="outlined" sx={{ height: '100%' }}>
                            <CardContent>
                              <Typography sx={{ fontWeight: 700, mb: 1.5 }}>
                                {formatLabel(floor)}
                              </Typography>
                              <Stack spacing={1.5}>
                                {recordEntries(floorData).slice(0, 4).map(([placeId, sensors]) => (
                                  <Card key={placeId} variant="outlined">
                                    <CardContent>
                                      <Typography sx={{ fontWeight: 600, mb: 1 }}>
                                        {formatLabel(placeId)}
                                      </Typography>
                                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                        {recordEntries(sensors).map(([sensorType]) => (
                                          <Chip
                                            key={sensorType}
                                            label={formatLabel(sensorType)}
                                            size="small"
                                            variant="outlined"
                                          />
                                        ))}
                                      </Stack>
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
          </Grid>
        </Grid>

        <Grid size={{ xs: 12, xl: 4 }}>
          <Stack spacing={2}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Evacuation state
                </Typography>
                {evacuationState ? (
                  renderPropertyList(evacuationState)
                ) : (
                  <Typography color="text.secondary">
                    No evacuation command has been recorded yet.
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Elevator state
                </Typography>
                {elevatorFloors.length === 0 ? (
                  <Typography color="text.secondary">
                    No elevator state data yet.
                  </Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {elevatorFloors.map(([floor, value]) => (
                      <Card key={floor} variant="outlined">
                        <CardContent>
                          <Typography sx={{ fontWeight: 700, mb: 1 }}>
                            {formatLabel(floor)}
                          </Typography>
                          {recordEntries(value).map(([key, nested]) => (
                            <Stack key={key} spacing={1} sx={{ mt: 1 }}>
                              <Typography variant="body2" color="text.secondary">
                                {formatLabel(key)}
                              </Typography>
                              {renderPropertyList(nested)}
                              <Divider />
                            </Stack>
                          ))}
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
                  Recent sensor events
                </Typography>
                {eventsLoading ? <CircularProgress size={20} /> : null}
                <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                  {events.map((event) => (
                    <Card key={event.id} variant="outlined">
                      <CardContent>
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          spacing={1}
                        >
                          <Typography variant="subtitle2">
                            {event.message ?? event.eventType ?? 'Sensor event'}
                          </Typography>
                          <Chip
                            size="small"
                            label={event.sensorType ?? 'unknown'}
                            color="primary"
                            variant="outlined"
                          />
                        </Stack>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 1, overflowWrap: 'anywhere' }}
                        >
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
                        <Typography sx={{ fontWeight: 600 }}>
                          No events yet
                        </Typography>
                        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                          Firestore is connected, but the `sensor_events`
                          collection has not received any records yet.
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
