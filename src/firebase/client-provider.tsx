'use client';

import React, { useState, useEffect, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';

// This is a public configuration, but the values are securely populated
// from environment variables at build time. Security is enforced by Firebase Security Rules.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let cachedServices:FirebaseServices|null=null;
function initializeClientFirebase() {
  if(cachedServices)return cachedServices;
  // This check is important because process.env variables are undefined at build time on the client.
  // Next.js replaces them with actual values if they are prefixed with NEXT_PUBLIC_.
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    let app: FirebaseApp;
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    const services={
      firebaseApp: app,
      auth: getAuth(app),
      // Bounded long-polling requests are more tolerant of proxies/mobile stream interruptions.
      // The browser still chooses HTTP/2 or HTTP/3; these settings do not disable QUIC.
      firestore: initializeFirestore(app, {
        experimentalForceLongPolling: true,
        experimentalAutoDetectLongPolling: false,
        experimentalLongPollingOptions: { timeoutSeconds: 25 },
      }),
    };
    if(process.env.NEXT_PUBLIC_FIREBASE_EMULATORS==='true'){
      if(!firebaseConfig.projectId.startsWith('demo-')||!['localhost','127.0.0.1'].includes(window.location.hostname))throw new Error('Emulators require a demo project on localhost.');
      connectAuthEmulator(services.auth,'http://127.0.0.1:9099',{disableWarnings:true});
      connectFirestoreEmulator(services.firestore,'127.0.0.1',8080);
    }
    cachedServices=services;return services;
  }
  // Return null if config is not fully available, preventing initialization errors.
  return null;
}


interface FirebaseClientProviderProps {
  children: ReactNode;
}

interface FirebaseServices {
  firebaseApp: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const [firebaseServices, setFirebaseServices] = useState<FirebaseServices | null>(null);

  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    // This effect runs only on the client, after the initial render.
    // It's safe to initialize Firebase here.
    if (typeof window !== 'undefined') {
       const services = initializeClientFirebase();
       setFirebaseServices(services);
       setInitialized(true);
    }
  }, []);

  return (
    <FirebaseProvider
      initialized={initialized}
      firebaseApp={firebaseServices?.firebaseApp || null}
      auth={firebaseServices?.auth || null}
      firestore={firebaseServices?.firestore || null}
    >
      {children}
    </FirebaseProvider>
  );
}
