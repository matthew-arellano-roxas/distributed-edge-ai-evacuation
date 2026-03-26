import type {
  ElevatorControlPayload,
  EvacuationPayload,
  SimulationResetTarget,
} from '../types/dashboard';

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000';

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export function triggerEvacuation(payload: EvacuationPayload) {
  return apiRequest('/evacuation/trigger', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function controlElevator(payload: ElevatorControlPayload) {
  return apiRequest('/elevator/control', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resetSimulation(target: SimulationResetTarget) {
  return apiRequest('/simulation/reset', {
    method: 'DELETE',
    body: JSON.stringify({ target }),
  });
}
