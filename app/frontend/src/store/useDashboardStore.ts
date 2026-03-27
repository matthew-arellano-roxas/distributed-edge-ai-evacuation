import { create } from 'zustand';
import {
  controlElevator,
  getDashboardEvents,
  getDashboardOverview,
  resetSimulation,
  triggerEvacuation,
} from '../lib/api';
import { subscribeSocketEvent } from '../lib/socket';
import type {
  DashboardEvent,
  DashboardOverview,
  ElevatorControlPayload,
  EvacuationPayload,
  SimulationResetTarget,
} from '../types/dashboard';

type DashboardStore = {
  events: DashboardEvent[];
  eventsLoading: boolean;
  eventsError: string | null;
  overview: DashboardOverview;
  overviewLoading: boolean;
  overviewError: string | null;
  lastCommandMessage: string | null;
  commandError: string | null;
  subscribeOverview: () => () => void;
  subscribeEvents: () => () => void;
  sendEvacuationCommand: (payload: EvacuationPayload) => Promise<void>;
  sendElevatorCommand: (payload: ElevatorControlPayload) => Promise<void>;
  clearSimulation: (target: SimulationResetTarget) => Promise<void>;
};

const initialOverview: DashboardOverview = {
  devices: null,
  latestDevices: null,
  sensors: null,
  occupancy: null,
  evacuation: null,
  elevators: null,
  refreshedAt: null,
};

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  events: [],
  eventsLoading: false,
  eventsError: null,
  overview: initialOverview,
  overviewLoading: false,
  overviewError: null,
  lastCommandMessage: null,
  commandError: null,
  subscribeOverview: () => {
    set({
      overviewLoading: true,
      overviewError: null,
    });

    let closed = false;
    let socketCleanup: (() => void) | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    const loadOverview = async (): Promise<void> => {
      try {
        const overview = await getDashboardOverview();
        if (closed) return;
        set({
          overview,
          overviewLoading: false,
          overviewError: null,
        });
      } catch (error) {
        if (closed) return;
        set({
          overviewError: formatError(error),
          overviewLoading: false,
        });
      }
    };

    void loadOverview();
    fallbackInterval = setInterval(() => {
      void loadOverview();
    }, 5000);

    void (async () => {
      try {
        socketCleanup = await subscribeSocketEvent<DashboardOverview>(
          'dashboard:overview',
          (overview) => {
            if (closed) return;
            set({
              overview,
              overviewLoading: false,
              overviewError: null,
            });
          },
        );
      } catch (error) {
        if (closed) return;
        set({
          overviewError: formatError(error),
          overviewLoading: false,
        });
      }
    })();

    return () => {
      closed = true;
      socketCleanup?.();
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  },
  subscribeEvents: () => {
    set({
      eventsLoading: true,
      eventsError: null,
    });

    let closed = false;
    let socketCleanup: (() => void) | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    const loadEvents = async (): Promise<void> => {
      try {
        const response = await getDashboardEvents(20);
        if (closed) return;
        set({
          events: response.events,
          eventsLoading: false,
          eventsError: null,
        });
      } catch (error) {
        if (closed) return;
        set({
          eventsError: formatError(error),
          eventsLoading: false,
        });
      }
    };

    void loadEvents();
    fallbackInterval = setInterval(() => {
      void loadEvents();
    }, 7000);

    void (async () => {
      try {
        socketCleanup = await subscribeSocketEvent<DashboardEvent[]>(
          'dashboard:events',
          (events) => {
            if (closed) return;
            set({
              events,
              eventsLoading: false,
              eventsError: null,
            });
          },
        );
      } catch (error) {
        if (closed) return;
        set({
          eventsError: formatError(error),
          eventsLoading: false,
        });
      }
    })();

    return () => {
      closed = true;
      socketCleanup?.();
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  },
  sendEvacuationCommand: async (payload) => {
    set({ commandError: null, lastCommandMessage: null });

    try {
      await triggerEvacuation(payload);
      set({ lastCommandMessage: 'Evacuation command sent successfully.' });
    } catch (error) {
      set({ commandError: formatError(error) });
      throw error;
    }
  },
  sendElevatorCommand: async (payload) => {
    set({ commandError: null, lastCommandMessage: null });

    try {
      await controlElevator(payload);
      set({ lastCommandMessage: 'Elevator command sent successfully.' });
    } catch (error) {
      set({ commandError: formatError(error) });
      throw error;
    }
  },
  clearSimulation: async (target) => {
    set({ commandError: null, lastCommandMessage: null });

    try {
      await resetSimulation(target);
      set({
        lastCommandMessage: `Simulation reset completed for ${target}.`,
      });
    } catch (error) {
      set({ commandError: formatError(error) });
      throw error;
    }
  },
}));
