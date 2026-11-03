/** Pure immutable timeline lineage shared by Convex and server projections.
 * Missing ownership/proof stays historical; display numbers are never proof. */
function row(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function timelineProductionVersion(timelineValue: unknown, productionValue: unknown, manifestValue?: unknown): string | undefined {
  const timeline = row(timelineValue), production = row(productionValue);
  if (!production.projectId || timeline.projectId !== production.projectId || timeline.productionId !== production._id || timeline.studioExternalId !== production.studioExternalId) return undefined;
  const tracks = row(timeline.tracks), metadata = row(tracks.metadata);
  const proofs: unknown[] = [tracks.productionVersionId, metadata.productionVersionId].filter(value => value !== undefined);
  if (timeline.manifestId !== undefined) {
    const manifest = row(manifestValue), payload = row(manifest.manifest);
    if (manifest._id !== timeline.manifestId || manifest.projectId !== production.projectId || manifest.productionId !== production._id || manifest.studioExternalId !== production.studioExternalId || payload.projectId !== production.projectId || payload.productionId !== production._id || payload.manifestId !== manifest._id || ![4, 5].includes(Number(payload.version)) || payload.version !== manifest.contractVersion) return undefined;
    proofs.push(payload.productionVersionId);
  }
  if (!proofs.length || proofs.some(value => typeof value !== 'string' || !value)) return undefined;
  return new Set(proofs).size === 1 ? proofs[0] as string : undefined;
}
export function timelineMatchesCurrentVersion(timeline: unknown, productionValue: unknown, versionValue: unknown, manifest?: unknown): boolean {
  const production = row(productionValue), version = row(versionValue);
  return Boolean(production.currentVersionId && version._id === production.currentVersionId && version.productionId === production._id && version.status === 'APPROVED' && timelineProductionVersion(timeline, production, manifest) === production.currentVersionId);
}
