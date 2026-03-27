import LaunchRoundedIcon from '@mui/icons-material/LaunchRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect } from 'react';
import { Link as RouterLink } from 'react-router';
import { useDashboardStore } from '../store/useDashboardStore';

type RecordValue = Record<string, unknown>;

type FireStatus = {
  id: string;
  floor: string;
  place: string;
  detected: boolean;
};

type DeviceStatus = {
  id: string;
  floor: string;
  status: string;
  deviceType: string;
};

type OccupancyStatus = {
  key: string;
  label: string;
  occupancy: string;
};

const cameraConfigs = [
  {
    id: 'pi5-cam-1',
    label: 'Raspberry Pi 5 Camera 1',
    url: import.meta.env.VITE_CAMERA_PI5_CAM1_HLS_URL ?? '',
  },
  {
    id: 'pi5-cam-2',
    label: 'Raspberry Pi 5 Camera 2',
    url: import.meta.env.VITE_CAMERA_PI5_CAM2_HLS_URL ?? '',
  },
  {
    id: 'pizero-cam-1',
    label: 'Raspberry Pi Zero Camera 1',
    url: import.meta.env.VITE_CAMERA_PIZERO_CAM1_HLS_URL ?? '',
  },
];

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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'No time yet';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function getFireStatuses(value: unknown): FireStatus[] {
  const statuses: FireStatus[] = [];

  for (const [floor, floorData] of recordEntries(value)) {
    for (const [branchKey, branchValue] of recordEntries(floorData)) {
      const branchRecord = asRecord(branchValue);
      if (branchRecord && String(branchRecord.type ?? branchKey).toLowerCase() === 'flame') {
        statuses.push({
          id: `${floor}:${floor}`,
          floor,
          place: floor,
          detected: toBoolean(branchRecord.detected ?? branchRecord.isFlameDetected),
        });
        continue;
      }

      for (const [sensorKey, sensorValue] of recordEntries(branchValue)) {
        const sensorRecord = asRecord(sensorValue);
        if (!sensorRecord) continue;

        if (String(sensorRecord.type ?? sensorKey).toLowerCase() === 'flame') {
          statuses.push({
            id: `${floor}:${branchKey}`,
            floor,
            place: branchKey,
            detected: toBoolean(sensorRecord.detected ?? sensorRecord.isFlameDetected),
          });
        }
      }
    }
  }

  return statuses.sort((a, b) =>
    `${a.floor}:${a.place}`.localeCompare(`${b.floor}:${b.place}`),
  );
}

function getDevices(value: unknown): DeviceStatus[] {
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

function getOccupancy(value: unknown): OccupancyStatus[] {
  return recordEntries(value)
    .map(([key, raw]) => {
      const entry = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      return {
        key,
        label: key === 'summary' ? 'Total' : formatLabel(key),
        occupancy: String(entry.occupancy ?? '-'),
      };
    })
    .sort((a, b) => {
      if (a.key === 'summary') return 1;
      if (b.key === 'summary') return -1;
      return a.label.localeCompare(b.label);
    });
}

export function OverviewPage() {
  const {
    overview,
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

  const fireStatuses = getFireStatuses(overview.sensors);
  const devices = getDevices(overview.latestDevices);
  const occupancy = getOccupancy(overview.occupancy);
  const recentAlerts = [...events].sort((a, b) =>
    new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );
  const evacuationMode =
    overview.evacuation &&
    typeof overview.evacuation === 'object' &&
    'evacuationMode' in overview.evacuation
      ? String((overview.evacuation as Record<string, unknown>).evacuationMode)
      : 'false';

  return (
    <Stack spacing={2.5}>
      {overviewError ? <Alert severity="error">{overviewError}</Alert> : null}
      {eventsError ? <Alert severity="error">{eventsError}</Alert> : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6">Fire status</Typography>
              <Stack spacing={1.25} sx={{ mt: 2 }}>
                {fireStatuses.length === 0 ? (
                  <Typography color="text.secondary">No fire sensor data yet.</Typography>
                ) : (
                  fireStatuses.map((item) => (
                    <Stack key={item.id} direction="row" justifyContent="space-between" spacing={2}>
                      <Typography>
                        {formatLabel(item.floor)} | {formatLabel(item.place)}
                      </Typography>
                      <Typography color={item.detected ? 'error.main' : 'success.main'}>
                        {item.detected ? 'Fire detected' : 'No fire'}
                      </Typography>
                    </Stack>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6">Recent alerts</Typography>
              <Stack spacing={1.25} sx={{ mt: 2 }}>
                {recentAlerts.length === 0 ? (
                  <Typography color="text.secondary">No alerts yet.</Typography>
                ) : (
                  recentAlerts.slice(0, 6).map((alert) => (
                    <Stack key={alert.id} spacing={0.35}>
                      <Typography sx={{ fontWeight: 600 }}>
                        {alert.message ?? 'Alert received'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {alert.floor ? `Floor ${alert.floor}` : 'No floor'} | {formatDateTime(alert.createdAt)}
                      </Typography>
                    </Stack>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6">Device status</Typography>
              <Stack spacing={1.25} sx={{ mt: 2 }}>
                {devices.length === 0 ? (
                  <Typography color="text.secondary">No device status yet.</Typography>
                ) : (
                  devices.map((device) => (
                    <Stack key={device.id} spacing={0.35}>
                      <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                        {device.id}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Floor {device.floor} | {device.deviceType}
                      </Typography>
                      <Typography>{device.status}</Typography>
                    </Stack>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6">Occupancy</Typography>
              <Stack spacing={1.25} sx={{ mt: 2 }}>
                {occupancy.length === 0 ? (
                  <Typography color="text.secondary">No occupancy data yet.</Typography>
                ) : (
                  occupancy.map((item) => (
                    <Stack key={item.key} direction="row" justifyContent="space-between" spacing={2}>
                      <Typography>{item.label}</Typography>
                      <Typography>{item.occupancy}</Typography>
                    </Stack>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6">Controls</Typography>
              <Typography color="text.secondary" sx={{ mt: 1.5, mb: 2 }}>
                Evacuation mode is currently {evacuationMode === 'true' ? 'active' : 'off'}.
              </Typography>
              <Button
                component={RouterLink}
                to="/controls"
                variant="contained"
                startIcon={<TuneRoundedIcon />}
              >
                Open controls
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6">Cameras</Typography>
              <Stack spacing={1.5} sx={{ mt: 2 }}>
                {cameraConfigs.map((camera) => (
                  <Stack
                    key={camera.id}
                    direction="row"
                    justifyContent="space-between"
                    spacing={1}
                    alignItems="center"
                  >
                    <Typography sx={{ minWidth: 0 }}>{camera.label}</Typography>
                    {camera.url ? (
                      <Button
                        variant="outlined"
                        size="small"
                        endIcon={<LaunchRoundedIcon />}
                        href={camera.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </Button>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Missing
                      </Typography>
                    )}
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
