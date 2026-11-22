import type { DirectorPlan } from '../types/database';

/** Normalize presentation labels and redundant CHARACTER self-bindings only.
 * approvedContext must be the server-resolved approved continuity context, never
 * model output. The backend still validates every immutable resource and voice ID. */
export function normalizePlannerResourceRoles(plan: DirectorPlan, approvedContext?: unknown): DirectorPlan {
  const context = approvedContext && typeof approvedContext === 'object'
    ? approvedContext as { resources?: unknown } : {};
  const resources = Array.isArray(context.resources) ? context.resources : [];
  const approvedCharacters = new Set(resources.flatMap((value: unknown) => {
    if (!value || typeof value !== 'object') return [];
    const resource = value as { resourceVersionId?: unknown; kind?: unknown };
    return resource.kind === 'CHARACTER' && typeof resource.resourceVersionId === 'string'
      ? [resource.resourceVersionId] : [];
  }));
  const result = structuredClone(plan);
  for (const sequence of result.sequences) for (const scene of sequence.scenes) for (const shot of scene.shots) {
    const seen = new Set<string>();
    for (const binding of shot.resourceBindings ?? []) {
      if (typeof binding.role !== 'string') throw new Error('PLANNER_RESOURCE_ROLE_INVALID');
      const role = binding.role.normalize('NFKD').replace(/[\u0300-\u036f\u200b-\u200d\ufeff]/g, '').replace(/[^A-Za-z0-9_ -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64).trim();
      if (!/^[A-Za-z][A-Za-z0-9_ -]{0,63}$/.test(role) || seen.has(role)) throw new Error('PLANNER_RESOURCE_ROLE_INVALID');
      seen.add(role);
      binding.role = role;
      // characterResourceVersionId expresses a costume/prop assignment. A
      // character redundantly pointing to itself adds no assignment information.
      // Leave all other relationships untouched for strict backend validation.
      if (approvedCharacters.has(binding.resourceVersionId)
        && binding.characterResourceVersionId === binding.resourceVersionId) {
        delete binding.characterResourceVersionId;
      }
    }
  }
  return result;
}
