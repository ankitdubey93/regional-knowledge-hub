import { useEffect, useState } from 'react';
import { deploymentInfoSchema, type DeploymentInfo } from '@chub/shared/lib/legal';
import { apiJson } from './api';

// Stage 3: this deployment's region, the other region's address and the legal version. The payload is public, so no secret goes here.

let cached: DeploymentInfo | null = null;

/** GET /api/meta once, zod-parse, then cache. Throws on a network error, a non-2xx or a parse failure, and caches nothing then. */
export async function loadDeployment(): Promise<DeploymentInfo> {
  if (cached !== null) return cached;
  const raw = await apiJson<unknown>('/meta');
  const info = deploymentInfoSchema.parse(raw);
  cached = info;
  return info;
}

/** The deployment info, or null while it loads or after a failed load. */
export function useDeployment(): DeploymentInfo | null {
  const [info, setInfo] = useState<DeploymentInfo | null>(cached);
  useEffect(() => {
    let cancelled = false;
    loadDeployment()
      .then((next) => {
        if (!cancelled) setInfo(next);
      })
      .catch(() => {
        // Stays null: the caller shows nothing region-specific.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return info;
}

/** Test helper: forget the cached deployment so the next load fetches again. */
export function resetDeploymentForTests(): void {
  cached = null;
}
