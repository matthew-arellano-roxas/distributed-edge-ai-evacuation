import { Server as HttpServer } from 'http';
import { Socket, Server as SocketIOServer } from 'socket.io';
import { env, logger } from 'config';

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  if (io) return io;

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.ALLOWED_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket: Socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    socket.on('chat:message', (payload: { message: string }) => {
      logger.info(`Socket message from ${socket.id}: ${payload.message}`);
      io!.emit('chat:message', {
        sender: socket.id,
        message: payload.message,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('disconnect', (reason: string) => {
      logger.info(`Socket disconnected: ${socket.id} - ${reason}`);
    });
  });

  return io;
}

export function getSocketServer(): SocketIOServer {
  if (!io) throw new Error('Socket server not initialized');
  return io;
}
