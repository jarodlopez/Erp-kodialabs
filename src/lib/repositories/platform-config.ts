import 'server-only';

import type { Id } from '@/types/common';
import type { PlanConfig, PlatformPlans } from '@/types/subscription';
import { DEFAULT_PLANS } from '@/lib/subscription';
import { mapDoc, nowIso } from './base';
import { refs } from './refs';

const PLANS_KEY = 'plans';

export const platformConfigRepository = {
  /** Planes vigentes; si no se han editado nunca, devuelve los de por defecto. */
  async getPlans(): Promise<PlanConfig[]> {
    const snap = await refs.platformConfig(PLANS_KEY).get();
    const stored = mapDoc<PlatformPlans & { id: string }>(snap);
    if (stored && Array.isArray(stored.plans) && stored.plans.length > 0) {
      return stored.plans;
    }
    return DEFAULT_PLANS;
  },

  async savePlans(plans: PlanConfig[], userId: Id): Promise<void> {
    await refs.platformConfig(PLANS_KEY).set(
      { plans, updatedAt: nowIso(), updatedBy: userId },
      { merge: true },
    );
  },
};
