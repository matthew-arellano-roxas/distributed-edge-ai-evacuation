import SendRoundedIcon from "@mui/icons-material/SendRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
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
} from "@mui/material";
import { useEffect, useState } from "react";
import { useDashboardStore } from "../store/useDashboardStore";
import type { SimulationResetTarget } from "../types/dashboard";

type RecordValue = Record<string, unknown>;

function formatLocationLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\broom\s*(\d+)\b/gi, "Room $1")
    .replace(/\bfire exit\s*(\d+)\b/gi, "Fire Exit $1")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" ? (value as RecordValue) : null;
}

function recordEntries(value: unknown): Array<[string, unknown]> {
  const record = asRecord(value);
  return record ? Object.entries(record) : [];
}

function formatScalar(value: unknown): string {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    const lowered = trimmed.toLowerCase();

    if (lowered === "true") return "On";
    if (lowered === "false") return "Off";
    return trimmed;
  }

  return String(value);
}

function renderPropertyList(data: unknown, limit = 6) {
  const entries = recordEntries(data).filter(
    ([, value]) => typeof value !== "object",
  );

  if (entries.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        No details yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      {entries.slice(0, limit).map(([key, value]) => (
        <Stack
          key={key}
          direction="row"
          justifyContent="space-between"
          spacing={2}
        >
          <Typography variant="body2" color="text.secondary">
            {formatLocationLabel(key)}
          </Typography>
          <Typography
            variant="body2"
            sx={{ textAlign: "right", overflowWrap: "anywhere" }}
          >
            {formatScalar(value)}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export function ControlsPage() {
  const {
    sendElevatorCommand,
    sendEvacuationCommand,
    clearSimulation,
    commandError,
    lastCommandMessage,
    overview,
    overviewLoading,
    overviewError,
    events,
    eventsLoading,
    eventsError,
    subscribeOverview,
    subscribeEvents,
  } = useDashboardStore();

  const [elevatorFloor, setElevatorFloor] = useState(1);
  const [evacuationModeDraft, setEvacuationModeDraft] = useState<
    "true" | "false" | null
  >(null);
  const [sourceFloor, setSourceFloor] = useState("1");
  const [sourceLocation, setSourceLocation] = useState("room101");
  const [targetFloors, setTargetFloors] = useState("2,3");

  useEffect(() => {
    const unsubscribeOverview = subscribeOverview();
    const unsubscribeEvents = subscribeEvents();

    return () => {
      unsubscribeOverview();
      unsubscribeEvents();
    };
  }, [subscribeEvents, subscribeOverview]);

  const handleReset = async (target: SimulationResetTarget) => {
    await clearSimulation(target);
  };

  const deviceFloors = recordEntries(overview.devices);
  const sensorFloors = recordEntries(overview.sensors);
  const occupancyEntries = recordEntries(overview.occupancy);
  const elevatorEntries = recordEntries(overview.elevators);
  const evacuationState = asRecord(overview.evacuation);
  const liveEvacuationMode =
    evacuationState?.evacuationMode === true ||
    evacuationState?.evacuationMode === "true"
      ? "true"
      : evacuationState?.evacuationMode === false ||
          evacuationState?.evacuationMode === "false"
        ? "false"
        : null;
  const selectedEvacuationMode =
    evacuationModeDraft ?? liveEvacuationMode ?? "false";

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="warning.light">
          Backend Commands
        </Typography>
        <Typography
          variant="h3"
          sx={{ fontSize: { xs: "2rem", md: "3rem" }, lineHeight: 1 }}
        >
          Command center
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
          Use this page for actions that should stay behind the backend API,
          like elevator movement, evacuation commands, and simulation resets.
        </Typography>
      </Box>

      {commandError ? <Alert severity="error">{commandError}</Alert> : null}
      {lastCommandMessage ? (
        <Alert severity="success">{lastCommandMessage}</Alert>
      ) : null}
      {overviewError ? <Alert severity="error">{overviewError}</Alert> : null}
      {eventsError ? <Alert severity="error">{eventsError}</Alert> : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack
                direction={{ xs: "column", lg: "row" }}
                spacing={{ xs: 2.5, lg: 3 }}
                divider={
                  <Divider
                    orientation="vertical"
                    flexItem
                    sx={{ display: { xs: "none", lg: "block" } }}
                  />
                }
              >
                <Box sx={{ width: { xs: "100%", lg: 320 }, flexShrink: 0 }}>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="h6">Elevator control</Typography>
                      <Typography
                        color="text.secondary"
                        variant="body2"
                        sx={{ mt: 0.5 }}
                      >
                        Send a floor command to the dedicated elevator
                        controller.
                      </Typography>
                    </Box>

                    <FormControl fullWidth>
                      <InputLabel id="elevator-floor-label">
                        Target floor
                      </InputLabel>
                      <Select
                        labelId="elevator-floor-label"
                        value={String(elevatorFloor)}
                        label="Target floor"
                        onChange={(event) =>
                          setElevatorFloor(Number(event.target.value))
                        }
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
                          controllerFloor: "floor1",
                        });
                      }}
                    >
                      Send elevator command
                    </Button>
                  </Stack>
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="h6">Evacuation control</Typography>
                      <Typography
                        color="text.secondary"
                        variant="body2"
                        sx={{ mt: 0.5 }}
                      >
                        Trigger or clear evacuation mode and define which floors
                        are involved.
                      </Typography>
                    </Box>

                    <Grid container spacing={2} alignItems="flex-start">
                      <Grid size={{ xs: 12, md: 4 }}>
                        <Stack spacing={0.75}>
                          <Box
                            sx={{
                              minHeight: 56,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              Evacuation mode
                            </Typography>
                            <Chip
                              size="small"
                              label={`Current live value: ${formatScalar(
                                evacuationState?.evacuationMode,
                              )}`}
                              color={
                                selectedEvacuationMode === "true"
                                  ? "warning"
                                  : "default"
                              }
                              variant="outlined"
                              sx={{ alignSelf: "flex-start" }}
                            />
                          </Box>
                          <ToggleButtonGroup
                            fullWidth
                            exclusive
                            color="warning"
                            value={selectedEvacuationMode}
                            sx={{
                              "& .MuiToggleButton-root": {
                                minHeight: 56,
                              },
                            }}
                            onChange={(_event, value) => {
                              if (value !== null) {
                                setEvacuationModeDraft(value);
                              }
                            }}
                          >
                            <ToggleButton value="true">On</ToggleButton>
                            <ToggleButton value="false">Off</ToggleButton>
                          </ToggleButtonGroup>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ minHeight: 20, display: "block", px: 1.75 }}
                          >
                            Matches the latest evacuation state from Firebase.
                          </Typography>
                        </Stack>
                      </Grid>

                      <Grid size={{ xs: 12, md: 4 }}>
                        <TextField
                          fullWidth
                          label="Source floor"
                          helperText="Example: 1, 2, or 3"
                          sx={{ mt: { xs: 0, md: 8 } }}
                          value={sourceFloor}
                          onChange={(event) =>
                            setSourceFloor(event.target.value)
                          }
                        />
                      </Grid>

                      <Grid size={{ xs: 12, md: 4 }}>
                        <TextField
                          fullWidth
                          label="Source location"
                          helperText={`Example: ${formatLocationLabel("room101")}`}
                          value={sourceLocation}
                          sx={{ mt: { xs: 0, md: 8 } }}
                          onChange={(event) =>
                            setSourceLocation(event.target.value)
                          }
                        />
                      </Grid>

                      <Grid size={{ xs: 12 }}>
                        <TextField
                          fullWidth
                          label="Target floors"
                          helperText="Comma-separated, for example Floor 2 and Floor 3 as 2,3"
                          value={targetFloors}
                          onChange={(event) =>
                            setTargetFloors(event.target.value)
                          }
                        />
                      </Grid>
                    </Grid>

                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.5}
                    >
                      <Button
                        variant="contained"
                        color="warning"
                        startIcon={<WarningAmberRoundedIcon />}
                        onClick={async () => {
                          await sendEvacuationCommand({
                            evacuationMode: selectedEvacuationMode === "true",
                            sourceFloor,
                            sourceLocation,
                            targetFloors: targetFloors
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          });
                          setEvacuationModeDraft(null);
                        }}
                      >
                        Send evacuation command
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 2 }}
              >
                <Box>
                  <Typography variant="h6">Current live values</Typography>
                  <Typography
                    color="text.secondary"
                    variant="body2"
                    sx={{ mt: 0.5 }}
                  >
                    This mirrors the latest data coming from Firebase so the
                    control page reflects the current state.
                  </Typography>
                </Box>
                {overviewLoading || eventsLoading ? (
                  <CircularProgress size={20} />
                ) : null}
              </Stack>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography color="text.secondary" variant="body2">
                        Device floors
                      </Typography>
                      <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                        {deviceFloors.length}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography color="text.secondary" variant="body2">
                        Sensor floors
                      </Typography>
                      <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                        {sensorFloors.length}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography color="text.secondary" variant="body2">
                        Occupancy entries
                      </Typography>
                      <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                        {occupancyEntries.length}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography color="text.secondary" variant="body2">
                        Recent events
                      </Typography>
                      <Typography variant="h4" sx={{ mt: 1, fontWeight: 700 }}>
                        {events.length}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined" sx={{ height: "100%" }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb: 2 }}>
                        Evacuation state
                      </Typography>
                      {evacuationState ? (
                        renderPropertyList(evacuationState)
                      ) : (
                        <Typography color="text.secondary">
                          No evacuation state recorded yet.
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined" sx={{ height: "100%" }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb: 2 }}>
                        Elevator state
                      </Typography>
                      {elevatorEntries.length === 0 ? (
                        <Typography color="text.secondary">
                          No elevator state data yet.
                        </Typography>
                      ) : (
                        <Stack spacing={1.5}>
                          {elevatorEntries.slice(0, 3).map(([floor, value]) => (
                            <Card key={floor} variant="outlined">
                              <CardContent>
                                <Typography sx={{ fontWeight: 700, mb: 1 }}>
                                  {formatLocationLabel(floor)}
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

                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined" sx={{ height: "100%" }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb: 2 }}>
                        Occupancy
                      </Typography>
                      {occupancyEntries.length === 0 ? (
                        <Typography color="text.secondary">
                          No occupancy data yet.
                        </Typography>
                      ) : (
                        <Stack spacing={1.5}>
                          {occupancyEntries.slice(0, 4).map(([key, value]) => (
                            <Card key={key} variant="outlined">
                              <CardContent>
                                <Typography sx={{ fontWeight: 700, mb: 1 }}>
                                  {formatLocationLabel(key)}
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

                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined" sx={{ height: "100%" }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb: 2 }}>
                        Recent sensor events
                      </Typography>
                      {events.length === 0 ? (
                        <Typography color="text.secondary">
                          No recent events yet.
                        </Typography>
                      ) : (
                        <Stack spacing={1.5}>
                          {events.slice(0, 5).map((event) => (
                            <Card key={event.id} variant="outlined">
                              <CardContent>
                                <Stack
                                  direction="row"
                                  justifyContent="space-between"
                                  spacing={1}
                                >
                                  <Typography variant="subtitle2">
                                    {event.message ??
                                      event.eventType ??
                                      "Sensor event"}
                                  </Typography>
                                  <Chip
                                    size="small"
                                    label={event.sensorType ?? "unknown"}
                                    variant="outlined"
                                    color="primary"
                                  />
                                </Stack>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ mt: 1 }}
                                >
                                  Floor: {event.floor ?? "-"} | Place:{" "}
                                  {event.placeId ?? "-"}
                                </Typography>
                              </CardContent>
                            </Card>
                          ))}
                        </Stack>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Typography variant="h6">Simulation reset</Typography>
              <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                Clear test data in Firebase during simulation runs.
              </Typography>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                useFlexGap
                flexWrap="wrap"
              >
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => void handleReset("realtime")}
                >
                  Clear realtime data
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => void handleReset("firestore")}
                >
                  Clear firestore data
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  onClick={() => void handleReset("both")}
                >
                  Clear both
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
