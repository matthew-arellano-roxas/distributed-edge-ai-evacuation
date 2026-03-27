import LaunchRoundedIcon from '@mui/icons-material/LaunchRounded';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import {
  Alert,
  Button,
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

const cameraConfigs: CameraConfig[] = [
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

export function CamerasPage() {
  return (
    <Stack spacing={3}>
      <Stack spacing={0.75}>
        <Typography variant="overline" color="secondary.main">
          Cameras
        </Typography>
        <Typography variant="h4">Quick access to stream endpoints</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 680 }}>
          Compact cards for stream status and links, with wrapping that stays inside the layout.
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
                      <Button
                        variant="contained"
                        endIcon={<LaunchRoundedIcon />}
                        href={camera.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open stream
                      </Button>
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
