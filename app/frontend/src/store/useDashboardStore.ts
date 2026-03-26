import { onValue, ref } from 'firebase/database';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { create } from 'zustand';
import { database, firestore } from '../lib/firebase';
import {
  controlElevator,
  getDashboardEvents,
  getDashboardOverview,
  resetSimulation,
  triggerEvacuation,
} from '../lib/api';
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

function withTimestamp(
  overview: DashboardOverview,
  patch: Partial<DashboardOverview>,
): DashboardOverview {
  return {
    ...overview,
    ...patch,
    refreshedAt: new Date().toISOString(),
  };
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
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let fallbackStarted = false;

    const pendingKeys = new Set<string>();
    const totalKeys = new Set([
      'devices',
      'latestDevices',
      'sensors',
      'occupancy',
      'evacuation',
      'elevators',
    ]);

    const loadOverviewFallback = async (): Promise<void> => {
      try {
        const overview = await getDashboardOverview();
        set({
          overview,
          overviewLoading: false,
          overviewError: null,
        });
      } catch (error) {
        set({
          overviewError: formatError(error),
          overviewLoading: false,
        });
      }
    };

    const startOverviewFallback = (): void => {
      if (fallbackStarted) {
        return;
      }

      fallbackStarted = true;
      void loadOverviewFallback();
      fallbackInterval = setInterval(() => {
        void loadOverviewFallback();
      }, 3000);
    };

    const attachListener = (
      key: keyof DashboardOverview,
      path: string,
    ): (() => void) =>
      onValue(
        ref(database, path),
        (snapshot) => {
          pendingKeys.add(key);
          set((state) => ({
            overview: withTimestamp(state.overview, {
              [key]: snapshot.exists()
                ? (snapshot.val() as Record<string, unknown>)
                : null,
            }),
            overviewLoading: pendingKeys.size < totalKeys.size,
            overviewError: null,
          }));
        },
        (error) => {
          startOverviewFallback();
          set({
            overviewError: formatError(error),
            overviewLoading: false,
          });
        },
      );

    const unsubscribers = [
      attachListener('devices', 'building/devices'),
      attachListener('latestDevices', 'building/device_status'),
      attachListener('sensors', 'building/sensors'),
      attachListener('occupancy', 'building/occupancy'),
      attachListener('evacuation', 'building/evacuation/state'),
      attachListener('elevators', 'building/state'),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
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
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let fallbackStarted = false;

    const loadEventsFallback = async (): Promise<void> => {
      try {
        const response = await getDashboardEvents(20);
        set({
          events: response.events,
          eventsLoading: false,
          eventsError: null,
        });
      } catch (error) {
        set({
          eventsError: formatError(error),
          eventsLoading: false,
        });
      }
    };

    const startEventsFallback = (): void => {
      if (fallbackStarted) {
        return;
      }

      fallbackStarted = true;
      void loadEventsFallback();
      fallbackInterval = setInterval(() => {
        void loadEventsFallback();
      }, 5000);
    };

    const unsubscribe = onSnapshot(
      query(
        collection(firestore, 'sensor_events'),
        orderBy('createdAt', 'desc'),
        limit(20),
      ),
      (snapshot) => {
        const events = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<DashboardEvent, 'id'>),
        }));

        set({
          events,
          eventsLoading: false,
          eventsError: null,
        });
      },
      (error) => {
        startEventsFallback();
        set({
          eventsError: formatError(error),
          eventsLoading: false,
        });
      },
    );

    return () => {
      unsubscribe();
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
