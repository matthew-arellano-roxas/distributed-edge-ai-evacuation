import 'config/env';
import express from 'express';
import { env } from 'config/env';
import { errorHandler, requestLogger } from '@/middleware';
import { logger, pubSub } from 'config';
import { createServer } from 'node:http';
import { connectRedis, getRedisClient, initSocketServer } from 'config';
import elevatorRoute from '@/routes/elevator.route';
import evacuationRoute from '@/routes/evacuation.route';
import simulationRoute from '@/routes/simulation.route';
import dashboardRoute from '@/routes/dashboard.route';

const app = express();
const httpServer = createServer(app);

initSocketServer(httpServer);

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');

  res.header(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  );
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
pubSub.init();

app.use(requestLogger);

app.use(elevatorRoute);
app.use(evacuationRoute);
app.use(simulationRoute);
app.use(dashboardRoute);
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use(errorHandler);

async function boostrap() {
  try {
    await connectRedis();
    const pingResult = await getRedisClient().ping();
    logger.info(`Connected to Redis (${pingResult})`);

    pubSub.init();
    logger.info('MQTT initialization requested');

    httpServer.listen(env.PORT, '0.0.0.0', () => {
      logger.info(`Server running on 0.0.0.0:${env.PORT}`);
    });
  } catch (error) {
    logger.error('Failed to connect to Redis', error);
    process.exit(1);
  }
}

void boostrap();
