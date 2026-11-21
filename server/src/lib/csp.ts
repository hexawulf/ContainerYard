/**
 * Helmet CSP and COOP configuration builder.
 *
 * When Firebase Google sign-in is disabled, the production CSP directives and
 * COOP behavior are byte-for-byte identical to v5.2.0. When enabled, only the
 * exact configured `FIREBASE_CLIENT_AUTH_DOMAIN` and required Google/Firebase
 * origins are added, and COOP switches to `same-origin-allow-popups` so the
 * Google OAuth popup can hand the ID token back to the opener.
 */
import type { HelmetOptions } from "helmet";
import { validateFirebaseConfig } from "../services/firebaseAuth";

export type CspDirectives = Record<string, string[]>;

export interface CspConfig {
  useDefaults: false;
  directives: CspDirectives;
}

export function buildCsp(env: NodeJS.ProcessEnv = process.env): CspConfig | false {
  if (env.NODE_ENV !== "production") {
    return false;
  }

  const fb = validateFirebaseConfig(env);
  if (!fb.enabled || !fb.authDomain) {
    return {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    };
  }

  const authOrigin = `https://${fb.authDomain}`;

  return {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://apis.google.com", "https://www.gstatic.com", authOrigin],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.googleusercontent.com", "https://www.gstatic.com"],
      connectSrc: [
        "'self'",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://www.googleapis.com",
        "https://apis.google.com",
        authOrigin,
      ],
      frameSrc: ["'self'", authOrigin, "https://accounts.google.com"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  };
}

export function buildHelmetOptions(env: NodeJS.ProcessEnv = process.env): HelmetOptions {
  const fb = validateFirebaseConfig(env);
  return {
    crossOriginEmbedderPolicy: false,
    ...(fb.enabled ? { crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" as const } } : {}),
    strictTransportSecurity: env.CY_ENABLE_APP_HSTS === "1",
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: buildCsp(env),
  };
}
