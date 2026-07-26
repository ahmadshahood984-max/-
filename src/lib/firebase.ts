/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfigJson from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey || "AIzaSyDcSshIC_Rs7m8uOF9OkHIJQ--JTifVKUQ",
  authDomain: firebaseConfigJson.authDomain || "aesthetic-night-p8gvj.firebaseapp.com",
  projectId: firebaseConfigJson.projectId || "aesthetic-night-p8gvj",
  storageBucket: firebaseConfigJson.storageBucket || "aesthetic-night-p8gvj.firebasestorage.app",
  messagingSenderId: firebaseConfigJson.messagingSenderId || "600017099331",
  appId: firebaseConfigJson.appId || "1:600017099331:web:23e214f289dbe0ecdc92f6"
};

const databaseId = firebaseConfigJson.firestoreDatabaseId || "ai-studio-c3b19e71-cc85-420b-8314-cb9b70b9467c";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore with force long polling for optimal connection stability in proxied/sandboxed environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, databaseId);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Safe export for Messaging (FCM)
export const getMessagingInstance = async () => {
  try {
    const { getMessaging, isSupported } = await import('firebase/messaging');
    const supported = await isSupported();
    if (supported) {
      return getMessaging(app);
    }
  } catch (err) {
    console.warn("FCM is not supported in this browser/environment:", err);
  }
  return null;
};

