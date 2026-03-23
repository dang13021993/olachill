import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, limit, serverTimestamp, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

const MOBILE_UA_REGEX = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i;

const shouldUseRedirectLogin = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  const ua = window.navigator.userAgent.toLowerCase();
  const isMobile = MOBILE_UA_REGEX.test(ua);
  const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches || (window.navigator as any).standalone === true;
  return isMobile || isStandalone;
};

const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
  'auth/internal-error',
  'auth/web-storage-unsupported'
]);

const AUTH_CONFIGURATION_CODES = new Set([
  'auth/unauthorized-domain',
  'auth/operation-not-allowed',
  'auth/invalid-api-key',
  'auth/app-not-authorized'
]);

let persistencePromise: Promise<void> | null = null;

const ensureAuthPersistence = async () => {
  if (persistencePromise) {
    return persistencePromise;
  }

  persistencePromise = (async () => {
    try {
      await setPersistence(auth, browserLocalPersistence);
      return;
    } catch (localErr) {
      console.warn('Failed to set local auth persistence, fallback to session:', localErr);
    }

    try {
      await setPersistence(auth, browserSessionPersistence);
      return;
    } catch (sessionErr) {
      console.warn('Failed to set session auth persistence, fallback to memory:', sessionErr);
    }

    await setPersistence(auth, inMemoryPersistence);
  })();

  return persistencePromise;
};

void ensureAuthPersistence();

// Auth Helpers
export const loginWithGoogle = async () => {
  await ensureAuthPersistence();

  if (shouldUseRedirectLogin()) {
    await signInWithRedirect(auth, googleProvider);
    return null;
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    const code = String(error?.code || '');
    if (!AUTH_CONFIGURATION_CODES.has(code) && (POPUP_FALLBACK_CODES.has(code) || code.startsWith('auth/'))) {
      try {
        await signInWithRedirect(auth, googleProvider);
        return null;
      } catch (redirectError) {
        console.error("Redirect login error:", redirectError);
        throw redirectError;
      }
    }
    console.error("Login error:", error);
    throw error;
  }
};

export const consumeRedirectLoginResult = async () => {
  await ensureAuthPersistence();
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (error) {
    console.error("Redirect result error:", error);
    throw error;
  }
};

export const logout = () => signOut(auth);

// Firestore Error Handler
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();
