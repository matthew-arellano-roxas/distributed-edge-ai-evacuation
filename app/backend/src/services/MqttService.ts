import mqtt, { MqttClient } from 'mqtt';
import { env, logger } from 'config';
import { rtdb } from '@root/config/firebase';
import {
  handleSensorReadings,
  subscribeToSensors,
} from '@/helpers/sensor-readings-handler';
import {
  handleElevatorState,
  subscribeToElevatorState,
  type ElevatorState,
} from '@/helpers/elevator-state-handler';
import { FlamePayload } from '../types/sensor-payload.types';
import {
  handleDeviceStatus,
  subscribeToDeviceStatus,
} from '@/helpers/device-status-handler';
import { MQTT_TOPICS } from '@/helpers/mqtt-topics';
import {
  handleOccupancy,
  Occupancy,
  subscribeToOccupancy,
} from '@/helpers/building-occupancy-handler';
import type { DeviceStatusMqttPayload } from '@/types/device-status.types';
import {
  handleEvacuationCommand,
  subscribeToEvacuationCommand,
} from '@/helpers/evacuation-command-handler';

type JsonValue = unknown;
type PublishOptions = {
  retain?: boolean;
};

class MqttService {
  private client: MqttClient | null = null;

  public init(): void {
    if (this.client) {
      logger.warn('MQTT already initialized');
      return;
    }

    this.client = mqtt.connect(env.MQTT_URL);

    this.registerEvents();
  }

  public async publish(
    topic: string,
    payload: object,
    options: PublishOptions = {},
  ): Promise<void> {
    if (!this.client) {
      throw new Error('MQTT client is not initialized');
    }

    const message = JSON.stringify(payload);

    await new Promise<void>((resolve, reject) => {
      this.client!.publish(
        topic,
        message,
        { retain: options.retain ?? false },
        (error?: Error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        },
      );
    });
  }

  private async replayPersistedState(): Promise<void> {
    const topicsToReplay = [MQTT_TOPICS.EVACUATION_COMMAND] as const;

    for (const topic of topicsToReplay) {
      const snapshot = await rtdb.ref(topic).get();
      if (!snapshot.exists()) {
        continue;
      }

      const payload = snapshot.val();
      if (!payload || typeof payload !== 'object') {
        continue;
      }

      await this.publish(topic, payload as Record<string, unknown>, {
        retain: true,
      });
      logger.info('Republished persisted MQTT state', { topic, payload });
    }
  }

  private async onConnect(): Promise<void> {
    logger.info('Connected to MQTT broker', {
      brokerUrl: env.MQTT_URL,
    });

    try {
      await subscribeToSensors(this.client!);
      await subscribeToElevatorState(this.client!);
      await subscribeToOccupancy(this.client!);
      await subscribeToDeviceStatus(this.client!);
      await subscribeToEvacuationCommand(this.client!);
      logger.info('MQTT subscriptions registered', {
        sensorRoot: `${MQTT_TOPICS.SENSOR_READINGS}/#`,
        deviceStatus: `building/+${MQTT_TOPICS.DEVICE_STATUS_SUFFIX}`,
        evacuationCommand: MQTT_TOPICS.EVACUATION_COMMAND,
        occupancyRoot: `${MQTT_TOPICS.OCCUPANCY}/#`,
        elevatorStatePattern: 'building/state/{floor}/elevator',
      });
      await this.replayPersistedState();
    } catch (err) {
      logger.error('Subscription failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleIncomingMessage(
    topic: string,
    payload: Buffer<ArrayBufferLike>,
  ): Promise<void> {
    const raw = payload.toString();

    try {
      const parsed = JSON.parse(raw);
      logger.info('MQTT message received', {
        topic,
        payloadType: 'json',
      });
      await this.routeMessage(topic, parsed);

      logger.info('MQTT message processed', { topic, parsed });
    } catch {
      logger.info('MQTT message received', {
        topic,
        payloadType: 'raw',
        raw,
      });
    }
  }

  private registerEvents(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      void this.onConnect();
    });

    this.client.on('message', (topic, payload) => {
      void this.handleIncomingMessage(topic, payload);
    });

    this.client.on('error', (err) => {
      logger.error('MQTT error', { message: err.message });
    });
  }

  private async routeMessage(topic: string, payload: JsonValue): Promise<void> {
    if (topic.startsWith(`${MQTT_TOPICS.SENSOR_READINGS}/`)) {
      logger.info('Routing MQTT topic to sensor handler', { topic });
      await handleSensorReadings(topic, payload as FlamePayload);
      return;
    }

    if (/^building\/state\/[^/]+\/elevator$/.test(topic)) {
      logger.info('Routing MQTT topic to elevator handler', { topic });
      await handleElevatorState(topic, payload as ElevatorState);
      return;
    }

    if (topic.includes(MQTT_TOPICS.OCCUPANCY)) {
      logger.info('Routing MQTT topic to occupancy handler', { topic });
      await handleOccupancy(topic, payload as Occupancy);
      return;
    }

    if (topic === MQTT_TOPICS.EVACUATION_COMMAND) {
      logger.info('Routing MQTT topic to evacuation handler', { topic });
      await handleEvacuationCommand(topic, payload);
      return;
    }

    if (/^building\/[^/]+\/devices$/.test(topic)) {
      logger.info('Routing MQTT topic to device status handler', { topic });
      await handleDeviceStatus(topic, payload as DeviceStatusMqttPayload);
      return;
    }

    logger.warn('Unhandled topic', { topic });
  }
}

let mqttService: MqttService | null = null;

export function getMqttService(): MqttService {
  if (mqttService) {
    return mqttService;
  }

  mqttService = new MqttService();
  return mqttService;
}

export default getMqttService();
