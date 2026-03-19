import 'config/env';
import express from 'express';
import { env } from 'config/env';
import { errorHandler, requestLogger } from '@/middleware';
import { logger, pubSub } from 'config';
import { createServer } from 'node:http';
import { initSocketServer } from 'config';
import elevatorRoute from '@/routes/elevator.route';
import evacuationRoute from '@/routes/evacuation.route';
import simulationRoute from '@/routes/simulation.route';

const app = express();
const httpServer = createServer(app);

initSocketServer(httpServer);
app.use(express.json());
pubSub.init();

app.use(requestLogger);

app.use(elevatorRoute);
app.use(evacuationRoute);
app.use(simulationRoute);
app.use(errorHandler);

async function boostrap() {
  try {
    pubSub.init();

    httpServer.listen(env.PORT, () => {
      logger.info(`Server running at http://localhost:${env.PORT}`);
    });
  } catch (error) {
    logger.error('Failed to connect to Redis', error);
    process.exit(1);
  }
}

void boostrap();
