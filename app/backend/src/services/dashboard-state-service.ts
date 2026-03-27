import { getRedisClient, getSocketServer, logger } from 'config';

type DashboardOverview = {
  devices: Record<string, unknown> | null;
  latestDevices: Record<string, unknown> | null;
  sensors: Record<string, unknown> | null;
  occupancy: Record<string, unknown> | null;
  evacuation: Record<string, unknown> | null;
  elevators: Record<string, unknown> | null;
  refreshedAt: string | null;
};

type DashboardEvent = {
  id: string;
  createdAt?: string;
  data?: Record<string, unknown>;
  eventType?: string;
  floor?: string;
  message?: string;
  placeId?: string;
  sensorType?: string;
};

const DASHBOARD_OVERVIEW_KEY = 'dashboard:overview';
const DASHBOARD_EVENTS_KEY = 'dashboard:events';
const DASHBOARD_EVENT_LIMIT = 20;

export function emptyOverview(): DashboardOverview {
  return {
    devices: null,
    latestDevices: null,
    sensors: null,
    occupancy: null,
    evacuation: null,
    elevators: null,
    refreshedAt: null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function setNestedValue(
  source: Record<string, unknown> | null,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  const root = { ...(source ?? {}) };
  let cursor: Record<string, unknown> = root;

  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    const next = asRecord(cursor[key]);
    const copy = { ...(next ?? {}) };
    cursor[key] = copy;
    cursor = copy;
  }

  cursor[path[path.length - 1]] = value;
  return root;
}

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await getRedisClient().get(key);
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as T;
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await getRedisClient().set(key, JSON.stringify(value));
}

function emitSocketEvent(event: string, payload: unknown): void {
  try {
    getSocketServer().emit(event, payload);
  } catch (error) {
    logger.warn('Socket broadcast skipped', {
      event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getCachedDashboardOverview(): Promise<DashboardOverview | null> {
  return readJson<DashboardOverview>(DASHBOARD_OVERVIEW_KEY);
}

export async function getDashboardOverviewOrEmpty(): Promise<DashboardOverview> {
  return (await getCachedDashboardOverview()) ?? emptyOverview();
}

export async function setCachedDashboardOverview(
  overview: DashboardOverview,
): Promise<void> {
  const payload = {
    ...overview,
    refreshedAt: overview.refreshedAt ?? new Date().toISOString(),
  };
  await writeJson(DASHBOARD_OVERVIEW_KEY, payload);
  emitSocketEvent('dashboard:overview', payload);
}

export async function patchDashboardOverviewBranch(
  key: keyof Omit<DashboardOverview, 'refreshedAt'>,
  path: string[],
  value: unknown,
): Promise<void> {
  const current = (await getCachedDashboardOverview()) ?? emptyOverview();
  const nextBranch =
    path.length === 0
      ? ((value as Record<string, unknown> | null) ?? null)
      : setNestedValue(asRecord(current[key]), path, value);

  const nextOverview: DashboardOverview = {
    ...current,
    [key]: nextBranch,
    refreshedAt: new Date().toISOString(),
  };

  await writeJson(DASHBOARD_OVERVIEW_KEY, nextOverview);
  emitSocketEvent('dashboard:overview', nextOverview);
}

export async function replaceDashboardOverviewBranch(
  key: keyof Omit<DashboardOverview, 'refreshedAt'>,
  value: Record<string, unknown> | null,
): Promise<void> {
  const current = await getDashboardOverviewOrEmpty();
  const nextOverview: DashboardOverview = {
    ...current,
    [key]: value,
    refreshedAt: new Date().toISOString(),
  };

  await writeJson(DASHBOARD_OVERVIEW_KEY, nextOverview);
  emitSocketEvent('dashboard:overview', nextOverview);
}

export async function getCachedDashboardEvents(): Promise<DashboardEvent[] | null> {
  return readJson<DashboardEvent[]>(DASHBOARD_EVENTS_KEY);
}

export async function setCachedDashboardEvents(
  events: DashboardEvent[],
): Promise<void> {
  const payload = events.slice(0, DASHBOARD_EVENT_LIMIT);
  await writeJson(DASHBOARD_EVENTS_KEY, payload);
  emitSocketEvent('dashboard:events', payload);
}

export async function pushDashboardEvent(event: DashboardEvent): Promise<void> {
  const current = (await getCachedDashboardEvents()) ?? [];
  const next = [event, ...current].slice(0, DASHBOARD_EVENT_LIMIT);
  await writeJson(DASHBOARD_EVENTS_KEY, next);
  emitSocketEvent('dashboard:events', next);
}

export async function clearDashboardStateCache(): Promise<void> {
  const overview = emptyOverview();
  await Promise.all([
    writeJson(DASHBOARD_OVERVIEW_KEY, overview),
    writeJson(DASHBOARD_EVENTS_KEY, []),
  ]);
  emitSocketEvent('dashboard:overview', overview);
  emitSocketEvent('dashboard:events', []);
}
