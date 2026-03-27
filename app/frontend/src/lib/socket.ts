import { getApiBaseUrl } from './api';

type SocketLike = {
  off: (event: string, listener?: (payload: unknown) => void) => void;
  on: (event: string, listener: (payload: unknown) => void) => void;
};

declare global {
  interface Window {
    __dashboardSocket?: SocketLike;
    __socketIoLoader?: Promise<void>;
    io?: (url: string, options?: Record<string, unknown>) => SocketLike;
  }
}

async function ensureSocketScript(): Promise<void> {
  if (window.io) {
    return;
  }

  if (!window.__socketIoLoader) {
    window.__socketIoLoader = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${getApiBaseUrl()}/socket.io/socket.io.js`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error('Failed to load Socket.IO client script'));
      document.head.appendChild(script);
    });
  }

  await window.__socketIoLoader;
}

async function getSocket(): Promise<SocketLike> {
  await ensureSocketScript();

  if (!window.__dashboardSocket) {
    if (!window.io) {
      throw new Error('Socket.IO client is unavailable');
    }

    window.__dashboardSocket = window.io(getApiBaseUrl(), {
      transports: ['websocket', 'polling'],
    });
  }

  return window.__dashboardSocket;
}

export async function subscribeSocketEvent<T>(
  event: string,
  listener: (payload: T) => void,
): Promise<() => void> {
  const socket = await getSocket();
  const handler = (payload: unknown) => listener(payload as T);
  socket.on(event, handler);

  return () => {
    socket.off(event, handler);
  };
}
