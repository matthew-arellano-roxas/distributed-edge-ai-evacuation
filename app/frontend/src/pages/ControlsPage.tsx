import SendRoundedIcon from '@mui/icons-material/SendRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useDashboardStore } from '../store/useDashboardStore';
import type { SimulationResetTarget } from '../types/dashboard';

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' ? (value as RecordValue) : null;
}

function formatScalar(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

export function ControlsPage() {
  const {
    sendElevatorCommand,
    sendEvacuationCommand,
    clearSimulation,
    commandError,
    lastCommandMessage,
    overview,
    overviewError,
    subscribeOverview,
  } = useDashboardStore();

  const [elevatorFloor, setElevatorFloor] = useState(1);
  const [evacuationModeDraft, setEvacuationModeDraft] = useState<'true' | 'false' | null>(null);
  const [sourceFloor, setSourceFloor] = useState('1');
  const [sourceLocation, setSourceLocation] = useState('room101');
  const [targetFloors, setTargetFloors] = useState('2,3');

  useEffect(() => {
    const unsubscribeOverview = subscribeOverview();
    return () => unsubscribeOverview();
  }, [subscribeOverview]);

  const evacuationState = asRecord(overview.evacuation);
  const liveEvacuationMode =
    evacuationState?.evacuationMode === true || evacuationState?.evacuationMode === 'true'
      ? 'true'
      : evacuationState?.evacuationMode === false || evacuationState?.evacuationMode === 'false'
        ? 'false'
        : 'false';
  const selectedEvacuationMode = evacuationModeDraft ?? liveEvacuationMode;

  const handleReset = async (target: SimulationResetTarget) => {
    await clearSimulation(target);
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.75}>
        <Typography variant="overline" color="warning.main">
          Controls
        </Typography>
        <Typography variant="h4">Backend command panel</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 720 }}>
          Keep only the actions that need operator input: elevator control, evacuation,
          and simulation reset.
        </Typography>
      </Stack>

      {commandError ? <Alert severity="error">{commandError}</Alert> : null}
      {lastCommandMessage ? <Alert severity="success">{lastCommandMessage}</Alert> : null}
      {overviewError ? <Alert severity="error">{overviewError}</Alert> : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6">Elevator control</Typography>
                <FormControl fullWidth>
                  <InputLabel id="elevator-floor-label">Target floor</InputLabel>
                  <Select
                    labelId="elevator-floor-label"
                    label="Target floor"
                    value={String(elevatorFloor)}
                    onChange={(event) => setElevatorFloor(Number(event.target.value))}
                  >
                    <MenuItem value="1">Floor 1</MenuItem>
                    <MenuItem value="2">Floor 2</MenuItem>
                    <MenuItem value="3">Floor 3</MenuItem>
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  startIcon={<SendRoundedIcon />}
                  onClick={() => {
                    void sendElevatorCommand({
                      floor: elevatorFloor,
                      controllerFloor: 'floor1',
                    });
                  }}
                >
                  Send elevator command
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6">Evacuation control</Typography>
                <ToggleButtonGroup
                  fullWidth
                  exclusive
                  color="warning"
                  value={selectedEvacuationMode}
                  onChange={(_event, value) => {
                    if (value !== null) setEvacuationModeDraft(value);
                  }}
                >
                  <ToggleButton value="true">On</ToggleButton>
                  <ToggleButton value="false">Off</ToggleButton>
                </ToggleButtonGroup>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="Source floor"
                      value={sourceFloor}
                      onChange={(event) => setSourceFloor(event.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="Source location"
                      value={sourceLocation}
                      onChange={(event) => setSourceLocation(event.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="Target floors"
                      helperText="Example: 2,3"
                      value={targetFloors}
                      onChange={(event) => setTargetFloors(event.target.value)}
                    />
                  </Grid>
                </Grid>

                <Button
                  variant="contained"
                  color="warning"
                  startIcon={<WarningAmberRoundedIcon />}
                  onClick={async () => {
                    await sendEvacuationCommand({
                      evacuationMode: selectedEvacuationMode === 'true',
                      sourceFloor,
                      sourceLocation,
                      targetFloors: targetFloors
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                    });
                    setEvacuationModeDraft(null);
                  }}
                >
                  Send evacuation command
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6">Current live values</Typography>
              <Stack spacing={1.25} sx={{ mt: 2 }}>
                <Stack direction="row" justifyContent="space-between" spacing={2}>
                  <Typography color="text.secondary">Evacuation mode</Typography>
                  <Typography>{selectedEvacuationMode === 'true' ? 'Active' : 'Off'}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" spacing={2}>
                  <Typography color="text.secondary">Source floor</Typography>
                  <Typography>{formatScalar(evacuationState?.sourceFloor)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" spacing={2}>
                  <Typography color="text.secondary">Source location</Typography>
                  <Typography sx={{ textAlign: 'right', overflowWrap: 'anywhere' }}>
                    {formatScalar(evacuationState?.sourceLocation)}
                  </Typography>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6">Simulation reset</Typography>
              <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                Clear cached dashboard data when you want a clean run.
              </Typography>
              <Button variant="contained" color="error" onClick={() => void handleReset('cache')}>
                Clear cache
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
