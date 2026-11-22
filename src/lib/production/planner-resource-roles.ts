import type { DirectorPlan } from '../types/database';

/** Role names are presentation labels, not resource identities. Normalize only
 * their spelling; the backend still validates every immutable resource ID. */
export function normalizePlannerResourceRoles(plan: DirectorPlan): DirectorPlan {
  const result = structuredClone(plan);
  for (const sequence of result.sequences) for (const scene of sequence.scenes) for (const shot of scene.shots) {
    const seen = new Set<string>();
    for (const binding of shot.resourceBindings ?? []) {
      if (typeof binding.role !== 'string') throw new Error('PLANNER_RESOURCE_ROLE_INVALID');
      const role = binding.role.normalize('NFKD').replace(/[\u0300-\u036f\u200b-\u200d\ufeff]/g, '').replace(/[^A-Za-z0-9_ -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64).trim();
      if (!/^[A-Za-z][A-Za-z0-9_ -]{0,63}$/.test(role) || seen.has(role)) throw new Error('PLANNER_RESOURCE_ROLE_INVALID');
      seen.add(role);
      binding.role = role;
    }
  }
  return result;
}
