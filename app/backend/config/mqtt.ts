import mqttService from '@/services/MqttService';

const init = () => {
  mqttService.init();
};

const publish = (topic: string, payload: object) => {
  return mqttService.publish(topic, payload);
};

export const pubSub = {
  init,
  publish,
};
