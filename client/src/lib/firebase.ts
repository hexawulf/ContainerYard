/**
 * Lazy-loaded Firebase Auth client helper (@firebase/app + @firebase/auth only).
 * Imported dynamically on the Login page only when Google sign-in is enabled.
 */
import { initializeApp, getApps, type FirebaseApp } from "@firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  type Auth,
} from "@firebase/auth";

export interface FirebaseClientConfig {
  enabled: boolean;
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  appId?: string;
}

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;

function getClientFirebaseAuth(config: FirebaseClientConfig): Auth {
  if (authInstance) return authInstance;

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    appInstance = existingApps[0];
    authInstance = getAuth(appInstance);
    return authInstance;
  }

  if (!config.apiKey || !config.projectId) {
    throw new Error("Incomplete Firebase configuration received from server.");
  }

  appInstance = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain || `${config.projectId}.firebaseapp.com`,
    projectId: config.projectId,
    appId: config.appId,
  });

  authInstance = getAuth(appInstance);
  return authInstance;
}

export async function signInWithGooglePopup(config: FirebaseClientConfig): Promise<string> {
  const auth = getClientFirebaseAuth(config);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account",
  });

  const credential = await signInWithPopup(auth, provider);
  return credential.user.getIdToken();
}
