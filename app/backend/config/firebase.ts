import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { env } from 'config';

const app = admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
  }),
  databaseURL: env.FIREBASE_DATABASE_URL,
});

export const db = getFirestore(app);
export const rtdb = getDatabase(app);
