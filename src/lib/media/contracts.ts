/**
 * The media contract is deliberately URL-free. Durable references are Convex
 * storage IDs; a URL is only introduced by the authorized resolver at the edge.
 */

export type JsonValue =
    | string
    | number
    | boolean
    | null
    | { [key: string]: JsonValue | undefined }
    | JsonValue[];

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'font' | 'model' | 'other';

export type MediaSource =
    | 'USER_UPLOAD'
    | 'AI_GENERATED'
    | 'PROVIDER_IMPORT'
    | 'DERIVED'
    | 'SYSTEM';

export type MediaRole =
    | 'SOURCE_IMAGE'
    | 'SOURCE_VIDEO'
    | 'SOURCE_AUDIO'
    | 'VOICE'
    | 'PRODUCT_REFERENCE'
    | 'IMAGE_REFERENCE'
    | 'GENERATED_VIDEO'
    | 'GENERATED_AUDIO'
    | 'THUMBNAIL'
    | 'EXPORT';

export type RightsStatus = 'OWNED' | 'LICENSED' | 'PUBLIC_DOMAIN' | 'RESTRICTED' | 'UNKNOWN';

export type ConsentStatus = 'NOT_REQUIRED' | 'PENDING' | 'GRANTED' | 'REVOKED' | 'UNKNOWN';

export interface MediaTechnicalMetadata {
    width?: number;
    height?: number;
    durationMs?: number;
    frameRate?: number;
    sampleRateHz?: number;
    channels?: number;
    codec?: string;
    colorSpace?: string;
    attributes?: Record<string, JsonValue>;
}

export interface MediaProvenance {
    source: MediaSource;
    sourceAssetIds?: string[];
    provider?: string;
    model?: string;
    jobId?: string;
    operation?: string;
    actorExternalId?: string;
    capturedAt?: number;
    createdAt: number;
}

export interface MediaRights {
    status: RightsStatus;
    holder?: string;
    licenseName?: string;
    licenseReference?: string;
    territories?: string[];
    usage?: string[];
    attribution?: string;
    restrictions?: string[];
    expiresAt?: number;
}

export interface MediaConsent {
    status: ConsentStatus;
    subjectReference?: string;
    purpose?: string;
    scope?: string[];
    evidenceReference?: string;
    grantedAt?: number;
    revokedAt?: number;
    expiresAt?: number;
}

export type LineageRelation = 'SOURCE' | 'DERIVED_FROM' | 'VARIANT_OF' | 'RENDERED_FROM';

export interface MediaLineage {
    relation: LineageRelation;
    parentAssetIds: string[];
    rootAssetIds?: string[];
    operation?: string;
    createdAt: number;
}

export interface MediaAssetContract {
    contractVersion: 'media-asset.v1';
    assetId: string;
    storageId: string;
    name?: string;
    kind: MediaKind;
    mimeType?: string;
    sizeBytes?: number;
    checksum?: string;
    roles: MediaRole[];
    metadata: MediaTechnicalMetadata;
    provenance: MediaProvenance;
    rights: MediaRights;
    consent: MediaConsent;
    lineage: MediaLineage;
    createdAt: number;
}

export interface AuthorizedMediaResolution {
    assetId: string;
    storageId: string;
    url: string;
    /** The client must discard the URL after this lease boundary. */
    expiresAt: number;
    ttlSeconds: number;
}

export function mediaKindFromMimeType(mimeType: string | undefined): MediaKind {
    const family = mimeType?.toLowerCase().split('/')[0];
    if (family === 'image' || family === 'video' || family === 'audio' || family === 'font') return family;
    if (mimeType?.toLowerCase() === 'application/octet-stream') return 'other';
    if (family === 'application' || family === 'text') return 'document';
    return 'other';
}

export function assertAuthorizedMediaResolution(
    resolution: AuthorizedMediaResolution,
    now: number = Date.now(),
): void {
    if (!resolution.url) throw new Error('Media resolver returned an empty URL');
    if (!Number.isFinite(resolution.expiresAt) || resolution.expiresAt <= now) {
        throw new Error('Media resolution has expired');
    }
}
