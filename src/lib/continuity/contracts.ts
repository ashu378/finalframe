import type { MediaRole } from '@/lib/media/contracts';

export type ContinuitySubject = 'CHARACTER' | 'LOCATION' | 'PROP' | 'PRODUCT' | 'STYLE' | 'VOICE' | 'BRAND';

export interface ContinuityAssetReference {
    assetId: string;
    subject: ContinuitySubject;
    role: MediaRole;
    label?: string;
    required: boolean;
    attributes?: Record<string, string | number | boolean>;
}

export interface ContinuityManifest {
    contractVersion: 'continuity.v1';
    productionId: string;
    version: number;
    references: ContinuityAssetReference[];
    createdAt: number;
    lockedAt?: number;
}

export function createContinuityManifest(input: {
    productionId: string;
    version?: number;
    references: ContinuityAssetReference[];
    createdAt?: number;
}): ContinuityManifest {
    if (!input.productionId) throw new Error('productionId is required for continuity');
    if (!input.references.length) throw new Error('At least one continuity reference is required');
    const ids = input.references.map((reference) => reference.assetId);
    if (new Set(ids).size !== ids.length) throw new Error('Continuity references must use unique asset IDs');
    return {
        contractVersion: 'continuity.v1',
        productionId: input.productionId,
        version: input.version ?? 1,
        references: input.references,
        createdAt: input.createdAt ?? Date.now(),
    };
}

export function lockContinuityManifest(manifest: ContinuityManifest, lockedAt: number = Date.now()): ContinuityManifest {
    if (manifest.lockedAt !== undefined) return manifest;
    return { ...manifest, lockedAt };
}

export function requiredContinuityAssetIds(manifest: ContinuityManifest): string[] {
    return manifest.references.filter((reference) => reference.required).map((reference) => reference.assetId);
}

export function assertContinuityAssetsAvailable(
    manifest: ContinuityManifest,
    availableAssetIds: Iterable<string>,
): void {
    const available = new Set(availableAssetIds);
    const missing = requiredContinuityAssetIds(manifest).filter((assetId) => !available.has(assetId));
    if (missing.length) throw new Error(`Missing continuity assets: ${missing.join(', ')}`);
}

export function replaceContinuityAsset(
    manifest: ContinuityManifest,
    previousAssetId: string,
    replacement: ContinuityAssetReference,
): ContinuityManifest {
    if (manifest.lockedAt !== undefined) throw new Error('Locked continuity manifests cannot be changed');
    const references = manifest.references.map((reference) =>
        reference.assetId === previousAssetId ? replacement : reference,
    );
    return createContinuityManifest({ ...manifest, references });
}
