import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
} from '@mui/material';

type CameraConfig = {
  id: string;
  label: string;
  url: string;
};

function normalizeUrl(url: string): string {
  const value = url.trim();
  if (!value) return '';
  try {
    return new URL(value).toString();
  } catch {
    return new URL(`http://${value}`).toString();
  }
}

const cameraConfigs: CameraConfig[] = [
  {
    id: 'pi5-cam-1',
    label: 'Raspberry Pi 5 Camera 1',
    url: normalizeUrl(import.meta.env.VITE_CAMERA_PI5_CAM1_HLS_URL ?? ''),
  },
  {
    id: 'pi5-cam-2',
    label: 'Raspberry Pi 5 Camera 2',
    url: normalizeUrl(import.meta.env.VITE_CAMERA_PI5_CAM2_HLS_URL ?? ''),
  },
  {
    id: 'pizero-cam-1',
    label: 'Raspberry Pi Zero Camera 1',
    url: normalizeUrl(import.meta.env.VITE_CAMERA_PIZERO_CAM1_HLS_URL ?? ''),
  },
];

export function CamerasPage() {
  return (
    <Stack spacing={3}>
      <Stack spacing={0.75}>
        <Typography variant="overline" color="secondary.main">
          Cameras
        </Typography>
        <Typography variant="h4">Live camera streams</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 680 }}>
          Each configured camera is embedded directly here so you can monitor streams without
          leaving the dashboard.
        </Typography>
      </Stack>

      <Grid container spacing={2}>
        {cameraConfigs.map((camera) => {
          const configured = camera.url.trim().length > 0;

          return (
            <Grid key={camera.id} size={{ xs: 12, md: 6, xl: 4 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Stack spacing={2}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <VideocamRoundedIcon color="secondary" />
                      <Typography variant="h6">{camera.label}</Typography>
                    </Stack>

                    {configured ? (
                      <Alert severity="success">Configured</Alert>
                    ) : (
                      <Alert severity="warning">Missing stream URL</Alert>
                    )}

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ overflowWrap: 'anywhere' }}
                    >
                      {camera.url || 'Add the stream URL in the frontend environment config.'}
                    </Typography>

                    {configured ? (
                      <Box
                        sx={{
                          borderRadius: 2,
                          overflow: 'hidden',
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'common.black',
                          aspectRatio: '16 / 9',
                        }}
                      >
                        <Box
                          component="img"
                          alt={camera.label}
                          src={camera.url}
                          sx={{
                            width: '100%',
                            height: '100%',
                            border: 0,
                            display: 'block',
                            objectFit: 'cover',
                            bgcolor: 'common.black',
                          }}
                        />
                      </Box>
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Stack>
  );
}
