import { Router } from 'express';
import { LEGAL_VERSION, type DeploymentInfo } from '@chub/shared/lib/legal';
import { deploymentRegion, env } from '../env';

// Public, session-free: this deployment's region, the other region's address and the legal version (Stage 3).
export const metaRoutes = Router();

metaRoutes.get('/', (_req, res) => {
  const body: DeploymentInfo = { region: deploymentRegion(), otherRegionUrl: env.OTHER_REGION_URL ?? null, legalVersion: LEGAL_VERSION };
  res.status(200).json(body);
});
