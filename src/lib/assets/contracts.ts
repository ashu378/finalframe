import type {
    AuthorizedMediaResolution,
    ConsentStatus,
    MediaAssetContract,
    MediaConsent,
    MediaKind,
    MediaLineage,
    MediaProvenance,
    MediaRights,
    MediaRole,
    MediaSource,
    MediaTechnicalMetadata,
    RightsStatus,
} from '@/lib/media/contracts';

export interface AssetUploadRequest {
    ownerExternalId: string;
    studioExternalId: string;
    productionId?: string;
    externalId?: string;
    name?: string;
    mimeType?: string;
    sizeBytes?: number;
    checksum?: string;
    source: MediaSource;
    roles: MediaRole[];
    metadata: MediaTechnicalMetadata;
    provenance: MediaProvenance;
    rights: MediaRights;
    consent: {
        status: ConsentStatus;
        subjectReference?: string;
        purpose?: string;
        scope?: string[];
        evidenceReference?: string;
        grantedAt?: number;
        revokedAt?: number;
        expiresAt?: number;
    };
    lineage: MediaLineage;
}

export interface AssetIngestRequest extends AssetUploadRequest {
    storageId: string;
}

export interface IngestedAsset {
    assetId: string;
    storageId: string;
    kind: MediaKind;
    mimeType?: string;
    checksum?: string;
}

export interface ConvexAssetTransport {
    generateUploadUrl(input: Pick<AssetUploadRequest, 'ownerExternalId' | 'studioExternalId'>): Promise<string>;
    ingestAsset(input: AssetIngestRequest): Promise<IngestedAsset>;
    resolveAuthorizedMedia(input: {
        ownerExternalId: string;
        assetId: string;
    }): Promise<AuthorizedMediaResolution | null>;
}

export function validateAssetUploadRequest(input: AssetUploadRequest): string[] {
    const errors: string[] = [];
    if (!input.ownerExternalId) errors.push('ownerExternalId is required');
    if (!input.studioExternalId) errors.push('studioExternalId is required');
    if (!input.source) errors.push('source is required');
    if (!input.roles.length) errors.push('at least one asset role is required');
    if (!input.provenance?.createdAt) errors.push('provenance.createdAt is required');
    if (!input.rights?.status) errors.push('rights.status is required');
    if (!input.consent?.status) errors.push('consent.status is required');
    if (!input.lineage?.relation) errors.push('lineage.relation is required');
    if (input.sizeBytes !== undefined && (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 0)) {
        errors.push('sizeBytes must be a non-negative finite number');
    }
    return errors;
}

export function assertAssetUploadRequest(input: AssetUploadRequest): void {
    const errors = validateAssetUploadRequest(input);
    if (errors.length) throw new Error(`Invalid asset contract: ${errors.join('; ')}`);
}

/**
 * Convex's current assets schema has one JSON metadata field. Keeping the
 * contract envelope here lets ingest preserve consent and lineage until those
 * fields become first-class schema columns.
 */
export function toAssetMetadata(input: AssetUploadRequest) {
    return {
        contractVersion: 'media-asset.v1' as const,
        kind: inferAssetKind(input.mimeType),
        sizeBytes: input.sizeBytes,
        technical: input.metadata,
        consent: input.consent,
        lineage: input.lineage,
    };
}

function inferAssetKind(mimeType: string | undefined): MediaKind {
    const family = mimeType?.toLowerCase().split('/')[0];
    if (family === 'image' || family === 'video' || family === 'audio' || family === 'font') return family;
    if (family === 'application' || family === 'text') return 'document';
    return 'other';
}

export type { ConsentStatus, RightsStatus, MediaAssetContract };
