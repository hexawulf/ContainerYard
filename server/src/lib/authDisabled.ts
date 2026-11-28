/**
 * AUTH_DISABLED=true turns every request into an ADMIN session (local
 * development only). The server reads only AUTH_DISABLED: VITE_AUTH_DISABLED
 * is a client build flag and no longer switches off server auth. With
 * NODE_ENV=production the server refuses to start while the flag is set.
 */
export function isAuthDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTH_DISABLED === "true";
}

/** Throws when auth is disabled in production; returns warnings to log otherwise. */
export function checkAuthDisabledPolicy(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings: string[] = [];
  if (isAuthDisabled(env)) {
    if (env.NODE_ENV === "production") {
      throw new Error("AUTH_DISABLED=true is not allowed with NODE_ENV=production; unset it.");
    }
    warnings.push("AUTH_DISABLED=true: authentication is OFF and every request is ADMIN. Development only.");
  }
  if (env.VITE_AUTH_DISABLED === "true" && !isAuthDisabled(env)) {
    warnings.push("VITE_AUTH_DISABLED is a client build flag and no longer disables server auth.");
  }
  return warnings;
}
