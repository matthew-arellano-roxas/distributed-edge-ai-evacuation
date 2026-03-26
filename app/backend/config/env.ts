import dotenv from 'dotenv';
import fs from 'fs';

export const loadEnvironment = () => {
  dotenv.config({
    path: '.env',
    override: false,
  });

  const env = process.env.NODE_ENV || 'development';
  const envFilePath = `.env.${env}`;

  if (fs.existsSync(envFilePath)) {
    dotenv.config({
      path: envFilePath,
      override: true,
    });
  }
};

loadEnvironment();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseAllowedOrigins(): string[] {
  const raw =
    process.env.ALLOWED_ORIGINS ??
    process.env.ALLOWED_ORIGIN ??
    'http://localhost:5173';

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => origin.replace(/\/+$/, ''));
}

export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  MQTT_URL: requireEnv('MQTT_URL'),
  REDIS_URL: requireEnv('REDIS_URL'),
  MQTT_USERNAME: process.env.MQTT_USERNAME ?? '',
  MQTT_PASSWORD: process.env.MQTT_PASSWORD ?? '',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  ALLOWED_ORIGINS: parseAllowedOrigins(),
  FIREBASE_SERVICE_ACCOUNT_PATH:
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? '',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? '',
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ?? '',
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ?? '',
  FIREBASE_DATABASE_URL: requireEnv('FIREBASE_DATABASE_URL'),
};
