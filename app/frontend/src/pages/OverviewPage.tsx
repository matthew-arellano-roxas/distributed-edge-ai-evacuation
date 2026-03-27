import {
  Alert,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { Button } from '@mui/material';
import { useEffect } from 'react';
import { Link as RouterLink } from 'react-router';
import { useDashboardStore } from '../store/useDashboardStore';

function countRecords(value: unknown): number {
  if (!value || typeof value !== 'object') {
    return 0;
  }

  return Object.keys(value as Record<string, unknown>).length;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Waiting for data';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function OverviewPage() {
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

  const summaryCards = [
    { label: 'Floors With Devices', value: countRecords(overview?.devices) },
    {
      label: 'Latest Device Snapshots',
      value: countRecords(overview?.latestDevices),
    },
    { label: 'Sensor Branches', value: countRecords(overview?.sensors) },
    { label: 'Recent Alerts', value: events.length },
  ];

  const hasAnyOverviewData = summaryCards.some((card) => card.value > 0);

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        spacing={2}
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
      >
        <div>
          <Typography variant="overline" color="success.light">
            Operations Dashboard
          </Typography>
          <Typography
            variant="h3"
            sx={{ fontSize: { xs: '2rem', md: '3rem' }, lineHeight: 1 }}
          >
            Smart building control center
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 720, mt: 1 }}>
            Live data now flows through the backend cache and Socket.IO, so the
            dashboard stays usable across your LAN without browser-side Firebase setup.
          </Typography>
        </div>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ width: { xs: '100%', md: 'auto' } }}
        >
          <Button
            component={RouterLink}
            to="/live-data"
            variant="contained"
            fullWidth
          >
            Open live data
          </Button>
          <Button
            component={RouterLink}
            to="/controls"
            variant="outlined"
            fullWidth
          >
            Open controls
          </Button>
        </Stack>
      </Stack>

      {overviewError ? <Alert severity="error">{overviewError}</Alert> : null}
      {eventsError ? <Alert severity="error">{eventsError}</Alert> : null}

      <Grid container spacing={2}>
        {summaryCards.map((card) => (
          <Grid key={card.label} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Card
              sx={{
                height: '100%',
                background:
                  'linear-gradient(180deg, rgba(15,23,42,0.9) 0%, rgba(15,23,42,0.72) 100%)',
              }}
            >
              <CardContent>
                <Typography color="text.secondary" variant="body2">
                  {card.label}
                </Typography>
                <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                  {card.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {hasAnyOverviewData ? 'Live data source' : 'No data yet'}
              </Typography>
              {hasAnyOverviewData ? (
                <>
                  <Typography color="text.secondary" sx={{ mb: 2 }}>
                    Backend state branches:
                  </Typography>
                  <Stack spacing={1}>
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>`building/devices`</Typography>
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>`building/device_status`</Typography>
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>`building/sensors`</Typography>
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>`building/occupancy`</Typography>
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>`building/evacuation/state`</Typography>
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>`building/state`</Typography>
                  </Stack>
                  <Typography color="text.secondary" sx={{ mt: 3, mb: 1 }}>
                    Event stream:
                  </Typography>
                  <Typography variant="body2">`dashboard events cache`</Typography>
                </>
              ) : (
                <Stack spacing={1.5}>
                  <Typography color="text.secondary">
                    The backend is connected, but there are no incoming device,
                    sensor, occupancy, evacuation, elevator, or event records yet.
                  </Typography>
                  <Typography color="text.secondary">
                    Once your ESP32s, Raspberry Pis, or backend start writing
                    data, this dashboard will populate automatically.
                  </Typography>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Connection status
              </Typography>
              <Stack spacing={1.5}>
                <Typography variant="body2" color="text.secondary">
                  Backend overview:
                </Typography>
                <Typography>
                  {overviewLoading ? 'Connecting...' : 'Connected'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Event stream:
                </Typography>
                <Typography>{eventsError ? 'Error' : 'Connected'}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Last refresh:
                </Typography>
                <Typography sx={{ overflowWrap: 'anywhere' }}>
                  {formatDateTime(overview.refreshedAt)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Recent event count:
                </Typography>
                <Typography>{events.length}</Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
