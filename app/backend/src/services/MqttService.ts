import mqtt, { MqttClient } from 'mqtt';
import { env, logger } from 'config';
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

type JsonValue = unknown;

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

  public async publish(topic: string, payload: object): Promise<void> {
    if (!this.client) {
      throw new Error('MQTT client is not initialized');
    }

    const message = JSON.stringify(payload);

    await new Promise<void>((resolve, reject) => {
      this.client!.publish(topic, message, (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private registerEvents(): void {
    if (!this.client) return;

    this.client.on('connect', async () => {
      logger.info('Connected to MQTT broker');

      try {
        await subscribeToSensors(this.client!);
        await subscribeToElevatorState(this.client!);
        await subscribeToOccupancy(this.client!);
        await subscribeToDeviceStatus(this.client!);
      } catch (err) {
        logger.error('Subscription failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    this.client.on('message', async (topic, payload) => {
      const raw = payload.toString();

      try {
        const parsed = JSON.parse(raw);
        await this.routeMessage(topic, parsed);

        logger.info('MQTT JSON received', { topic, parsed });
      } catch {
        logger.info('MQTT raw received', { topic, raw });
      }
    });

    this.client.on('error', (err) => {
      logger.error('MQTT error', { message: err.message });
    });
  }

  private async routeMessage(topic: string, payload: JsonValue): Promise<void> {
    if (topic.includes(MQTT_TOPICS.SENSOR_READINGS)) {
      await handleSensorReadings(topic, payload as FlamePayload);
      return;
    }

    if (topic.includes(MQTT_TOPICS.ELEVATOR_STATE)) {
      await handleElevatorState(topic, payload as ElevatorState);
      return;
    }

    if (topic.includes(MQTT_TOPICS.OCCUPANCY)) {
      await handleOccupancy(topic, payload as Occupancy);
      return;
    }

    if (topic.includes(MQTT_TOPICS.DEVICE_STATUS)) {
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
