import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  signInWithPopup,
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
googleProvider.setCustomParameters({ prompt: 'select_account' });

let persistencePromise: Promise<void> | null = null;
type PersistenceMode = 'local' | 'session' | 'memory' | 'unknown';
let persistenceMode: PersistenceMode = 'unknown';
const REDIRECT_PENDING_KEY = 'olachill_auth_redirect_pending';

const ensureAuthPersistence = async () => {
  if (persistencePromise) {
    return persistencePromise;
  }

  persistencePromise = (async () => {
    try {
      await setPersistence(auth, browserLocalPersistence);
      persistenceMode = 'local';
      return;
    } catch (localErr) {
      console.warn('Failed to set local auth persistence, fallback to session:', localErr);
    }

    try {
      await setPersistence(auth, browserSessionPersistence);
      persistenceMode = 'session';
      return;
    } catch (sessionErr) {
      console.warn('Failed to set session auth persistence, fallback to memory:', sessionErr);
    }

    await setPersistence(auth, inMemoryPersistence);
    persistenceMode = 'memory';
  })();

  return persistencePromise;
};

void ensureAuthPersistence();

// Auth Helpers
export const loginWithGoogle = async () => {
  await ensureAuthPersistence();
  const enableRedirectFallback = String((import.meta as any)?.env?.VITE_AUTH_REDIRECT_FALLBACK || '').toLowerCase() === 'true';

  const runRedirectFlow = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(REDIRECT_PENDING_KEY, '1');
    }
    await signInWithRedirect(auth, googleProvider);
    return null;
  };

  try {
    const popupResult = await signInWithPopup(auth, googleProvider);
    return popupResult?.user || null;
  } catch (popupError: any) {
    const code = String(popupError?.code || '');
    const canFallbackToRedirect =
      code === 'auth/popup-blocked' ||
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      code === 'auth/internal-error';

    if (enableRedirectFallback && canFallbackToRedirect && persistenceMode !== 'memory') {
      console.warn('Popup login failed, fallback to redirect flow:', code);
      return runRedirectFlow();
    }
    throw popupError;
  }
};

export const consumeRedirectLoginResult = async () => {
  await ensureAuthPersistence();
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (error: any) {
    const code = String(error?.code || '');
    if (code === 'auth/no-auth-event') {
      return null;
    }
    if (code === 'auth/invalid-action-code' || code === 'auth/invalid-continue-uri' || code === 'auth/argument-error') {
      console.warn('Ignoring stale/invalid redirect auth response:', code);
      return null;
    }
    console.error("Redirect result error:", error);
    throw error;
  } finally {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(REDIRECT_PENDING_KEY);
    }
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
