import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { env } from 'config';
import fs from 'fs';

function getFirebaseCredential(): admin.credential.Credential {
  if (
    env.FIREBASE_SERVICE_ACCOUNT_PATH &&
    fs.existsSync(env.FIREBASE_SERVICE_ACCOUNT_PATH)
  ) {
    const serviceAccount = JSON.parse(
      fs.readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'),
    ) as admin.ServiceAccount;

    return admin.credential.cert(serviceAccount);
  }

  if (
    env.FIREBASE_PROJECT_ID &&
    env.FIREBASE_PRIVATE_KEY &&
    env.FIREBASE_CLIENT_EMAIL
  ) {
    return admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
    });
  }

  throw new Error(
    'Firebase credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_PATH or the FIREBASE_PROJECT_ID / FIREBASE_PRIVATE_KEY / FIREBASE_CLIENT_EMAIL env vars.',
  );
}

const app = admin.initializeApp({
  credential: getFirebaseCredential(),
  databaseURL: env.FIREBASE_DATABASE_URL,
});

export const db = getFirestore(app);
export const rtdb = getDatabase(app);
