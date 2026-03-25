import mqttService from '@/services/MqttService';

const init = () => {
  mqttService.init();
};

const publish = (
  topic: string,
  payload: object,
  options?: { retain?: boolean },
) => {
  return mqttService.publish(topic, payload, options);
};

export const pubSub = {
  init,
  publish,
};
