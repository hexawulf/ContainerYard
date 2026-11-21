/**
 * Google sign-in via Firebase Auth (firebase-admin).
 *
 * Mirrors the PiDeck / PiTasker pattern with ContainerYard-specific hardening:
 * - Strict server-side email allowlist (`FIREBASE_ALLOWED_EMAILS`).
 * - Requires `email_verified === true` AND `firebase.sign_in_provider === "google.com"`.
 * - Verifies ID tokens with `checkRevoked = true`.
 * - Misconfiguration warns at startup and degrades to disabled (never crashes so
 *   break-glass password login keeps working). Never logs service-account contents.
 */
import fs from "fs";
import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
  type App,
  type Credential,
} from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { HttpError } from "../lib/httpError";

const AUTH_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export interface FirebasePublicConfig {
  enabled: boolean;
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  appId?: string;
}

export interface VerifiedFirebaseUser {
  email: string;
  uid: string;
  name?: string;
}

export type VerifyIdTokenFn = (idToken: string, checkRevoked: boolean) => Promise<DecodedIdToken>;

export interface FirebaseConfigValidation {
  enabled: boolean;
  reason?: string;
  projectId?: string;
  authDomain?: string;
  apiKey?: string;
  appId?: string;
  allowedCount: number;
}

let firebaseAdminApp: App | null = null;

export function resetFirebaseAdminForTests(): void {
  firebaseAdminApp = null;
}

function isFlagEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const val = (env.FIREBASE_ENABLED || "").trim().toLowerCase();
  return val === "true" || val === "1" || val === "yes";
}

export function getFirebaseAllowedEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.FIREBASE_ALLOWED_EMAILS || "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const email = part.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/**
 * Validates Firebase env configuration and (if configured) the service-account
 * key file/JSON. Never logs secrets or key contents.
 */
export function validateFirebaseConfig(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = () => undefined,
): FirebaseConfigValidation {
  const allowedCount = getFirebaseAllowedEmails(env).length;
  if (!isFlagEnabled(env)) {
    return { enabled: false, reason: "disabled", allowedCount };
  }

  const projectId = (env.FIREBASE_PROJECT_ID || "").trim();
  const apiKey = (env.FIREBASE_CLIENT_API_KEY || "").trim();
  const authDomain = (env.FIREBASE_CLIENT_AUTH_DOMAIN || "").trim();
  const appId = (env.FIREBASE_CLIENT_APP_ID || "").trim();

  if (!projectId || !apiKey || !authDomain || !appId) {
    warn(
      "[Firebase] FIREBASE_ENABLED is set, but FIREBASE_PROJECT_ID or client config " +
        "(FIREBASE_CLIENT_API_KEY, FIREBASE_CLIENT_AUTH_DOMAIN, FIREBASE_CLIENT_APP_ID) is missing; " +
        "Google sign-in disabled.",
    );
    return { enabled: false, reason: "incomplete_config", allowedCount };
  }

  if (!AUTH_DOMAIN_RE.test(authDomain)) {
    warn("[Firebase] FIREBASE_CLIENT_AUTH_DOMAIN is not a valid hostname; Google sign-in disabled.");
    return { enabled: false, reason: "invalid_auth_domain", allowedCount };
  }

  const keyPath = (env.FIREBASE_SERVICE_ACCOUNT_PATH || "").trim();
  const rawJson = (env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();

  if (keyPath) {
    try {
      const content = fs.readFileSync(keyPath, "utf8");
      const parsed = JSON.parse(content) as { project_id?: unknown };
      if (!parsed || typeof parsed !== "object" || parsed.project_id !== projectId) {
        warn(
          "[Firebase] Service account file project_id does not match FIREBASE_PROJECT_ID; Google sign-in disabled.",
        );
        return { enabled: false, reason: "project_id_mismatch", allowedCount };
      }
    } catch {
      warn(
        `[Firebase] Service account file at ${keyPath} is missing, unreadable, or invalid JSON; Google sign-in disabled.`,
      );
      return { enabled: false, reason: "invalid_service_account_file", allowedCount };
    }
  } else if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as { project_id?: unknown };
      if (!parsed || typeof parsed !== "object" || parsed.project_id !== projectId) {
        warn(
          "[Firebase] FIREBASE_SERVICE_ACCOUNT_JSON project_id does not match FIREBASE_PROJECT_ID; Google sign-in disabled.",
        );
        return { enabled: false, reason: "project_id_mismatch", allowedCount };
      }
    } catch {
      warn("[Firebase] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON; Google sign-in disabled.");
      return { enabled: false, reason: "invalid_service_account_json", allowedCount };
    }
  }

  return {
    enabled: true,
    projectId,
    authDomain,
    apiKey,
    appId,
    allowedCount,
  };
}

export function isFirebaseEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return validateFirebaseConfig(env).enabled;
}

export function initFirebaseAtStartup(
  env: NodeJS.ProcessEnv = process.env,
  logger: { info: (m: string) => void; warn: (m: string) => void } = {
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
  },
): FirebaseConfigValidation {
  const result = validateFirebaseConfig(env, (m) => logger.warn(m));
  if (result.enabled) {
    logger.info(`Google sign-in enabled (${result.allowedCount} allowed)`);
  }
  return result;
}

export function getFirebasePublicConfig(env: NodeJS.ProcessEnv = process.env): FirebasePublicConfig {
  const cfg = validateFirebaseConfig(env);
  if (!cfg.enabled) {
    return { enabled: false };
  }
  return {
    enabled: true,
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    appId: cfg.appId,
  };
}

export function getFirebaseAdminApp(env: NodeJS.ProcessEnv = process.env): App {
  if (firebaseAdminApp) {
    return firebaseAdminApp;
  }

  const existingApps = getApps();
  if (existingApps && existingApps.length > 0 && existingApps[0]) {
    firebaseAdminApp = existingApps[0];
    return firebaseAdminApp;
  }

  let credential: Credential;
  let projectId = (env.FIREBASE_PROJECT_ID || "").trim() || undefined;

  const keyPath = (env.FIREBASE_SERVICE_ACCOUNT_PATH || "").trim();
  const rawJson = (env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();

  if (keyPath) {
    try {
      const content = fs.readFileSync(keyPath, "utf8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      credential = cert(parsed);
      if (!projectId && typeof parsed.project_id === "string") {
        projectId = parsed.project_id;
      }
    } catch {
      throw new Error(`Failed to load ContainerYard Firebase service account from ${keyPath}`);
    }
  } else if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as Record<string, unknown>;
      credential = cert(parsed);
      if (!projectId && typeof parsed.project_id === "string") {
        projectId = parsed.project_id;
      }
    } catch {
      throw new Error("Invalid ContainerYard FIREBASE_SERVICE_ACCOUNT_JSON");
    }
  } else {
    credential = applicationDefault();
  }

  firebaseAdminApp = initializeApp({
    credential,
    projectId,
  });

  return firebaseAdminApp;
}

export async function verifyFirebaseLogin(
  idToken: string,
  env: NodeJS.ProcessEnv = process.env,
  verifyTokenImpl?: VerifyIdTokenFn,
): Promise<VerifiedFirebaseUser> {
  if (!isFirebaseEnabled(env)) {
    throw new HttpError("Firebase authentication is disabled on this host.", 503, {
      code: "firebase_disabled",
    });
  }

  if (!idToken || typeof idToken !== "string" || !idToken.trim() || idToken.length > 4096) {
    throw new HttpError("Missing or invalid ID token.", 400, { code: "invalid_payload" });
  }

  let verifyFn: VerifyIdTokenFn;
  if (verifyTokenImpl) {
    verifyFn = verifyTokenImpl;
  } else {
    let app: App;
    try {
      app = getFirebaseAdminApp(env);
    } catch {
      throw new HttpError("Firebase Admin is not configured properly on ContainerYard.", 503, {
        code: "admin_misconfigured",
      });
    }
    verifyFn = (token, checkRevoked) => getAuth(app).verifyIdToken(token, checkRevoked);
  }

  let decoded: DecodedIdToken;
  try {
    decoded = await verifyFn(idToken.trim(), true);
  } catch {
    throw new HttpError("Invalid or expired Firebase ID token.", 401, {
      code: "invalid_or_revoked_token",
    });
  }

  const email = (decoded.email || "").trim().toLowerCase();
  if (!email || decoded.email_verified !== true) {
    throw new HttpError("Google account email is missing or not verified.", 403, {
      code: "email_unverified",
    });
  }

  const signInProvider = decoded.firebase?.sign_in_provider;
  if (signInProvider !== "google.com") {
    throw new HttpError("Only Google sign-in is accepted on ContainerYard.", 403, {
      code: "unsupported_provider",
    });
  }

  const allowedEmails = getFirebaseAllowedEmails(env);
  if (allowedEmails.length === 0) {
    throw new HttpError("No authorized accounts configured on ContainerYard.", 403, {
      code: "empty_allowlist",
    });
  }

  if (!allowedEmails.includes(email)) {
    throw new HttpError(`Account ${email} is not authorized to access ContainerYard.`, 403, {
      code: "not_allowlisted",
    });
  }

  return {
    email,
    uid: decoded.uid,
    name: typeof decoded.name === "string" ? decoded.name : undefined,
  };
}
