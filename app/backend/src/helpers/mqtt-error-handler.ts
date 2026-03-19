import { MqttClient, ISubscriptionGrant, IClientSubscribeOptions } from 'mqtt';
import { logger } from 'config';
export function subscribeWithHandler(
  client: MqttClient,
  topics: string | string[],
  options: IClientSubscribeOptions = { qos: 1 },
): void {
  client.subscribe(topics, options, (err, granted) => {
    if (err) {
      logger.error('[MQTT] Subscribe error:', err.message);
      return;
    }

    if (!granted || granted.length === 0) {
      logger.warn('[MQTT] No topics granted');
      return;
    }

    handleGranted(granted);
  });
}

function handleGranted(granted: ISubscriptionGrant[]): void {
  for (const sub of granted) {
    if (sub.qos === 128) {
      logger.error(`[MQTT] Subscription rejected: ${sub.topic}`);
      continue;
    }

    logger.info(`[MQTT] Subscribed → ${sub.topic} (QoS ${sub.qos})`);
  }
}

export function attachMqttErrorHandlers(client: MqttClient): void {
  client.on('error', (err: Error) => {
    logger.error('[MQTT] Connection error:', err.message);
  });

  client.on('close', () => {
    logger.warn('[MQTT] Connection closed');
  });

  client.on('reconnect', () => {
    logger.warn('[MQTT] Reconnecting...');
  });

  client.on('offline', () => {
    logger.warn('[MQTT] Offline');
  });
}
