// Backend liveness and readiness, per openapi.yaml.
//
// Nothing on the public site depends on these: nginx serves its own /healthz
// for frontend health (see nginx.conf), which is deliberately independent of
// whether the Go API is up — the site must render with the backend down.
// These exist for diagnostics and for any future fragment that wants to check
// before offering a write.

import { apiRequest } from "./api";
import { isStatus, type Status } from "./api-contract";

/** GET /healthz — is the API process alive? Rejects with ApiError if not. */
export function getHealth(signal?: AbortSignal): Promise<Status> {
  return apiRequest<Status>("/healthz", { validate: isStatus, signal });
}

/** GET /readyz — the API answers 200 `ready` or 503 `unavailable`. */
export function getReadiness(signal?: AbortSignal): Promise<Status> {
  return apiRequest<Status>("/readyz", { validate: isStatus, signal });
}

/**
 * Convenience wrapper: `false` for every not-ready case, including the 503
 * the spec defines for an unreachable database. A 503 is normal operation
 * here, not an exception, so it is not worth making callers catch it.
 */
export async function isBackendReady(signal?: AbortSignal): Promise<boolean> {
  try {
    return (await getReadiness(signal)).status === "ready";
  } catch {
    return false;
  }
}
