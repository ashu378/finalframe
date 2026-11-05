/** Cast descriptions propose an identity; only explicit project bindings can
 * make it production-ready. Derive requirements from structured plan data. */
export function proposedCast(plan: unknown): Array<{ key: string; name: string; description: string }> {
  const body = plan && typeof plan === 'object' ? plan as Record<string, any> : {};
  const characters = body.bible?.characters;
  if (characters === undefined) return [];
  if (!Array.isArray(characters) || characters.length > 32) throw new Error('RECIPE_CAST_REFERENCES_REQUIRED');
  const names = new Set<string>();
  return characters.map((value, index) => {
    const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 200 || names.has(row.name.trim().toLowerCase())) throw new Error('RECIPE_CAST_REFERENCES_REQUIRED');
    names.add(row.name.trim().toLowerCase());
    return { key: `cast_${index}`, name: row.name.trim(), description: typeof row.description === 'string' ? row.description : '' };
  });
}
export function castPlanShots(plan: unknown): Array<Record<string, any>> {
  const body = plan && typeof plan === 'object' ? plan as Record<string, any> : {};
  return (Array.isArray(body.sequences) ? body.sequences : []).flatMap((sequence: any) => (Array.isArray(sequence.scenes) ? sequence.scenes : []).flatMap((scene: any) => Array.isArray(scene.shots) ? scene.shots : []));
}
