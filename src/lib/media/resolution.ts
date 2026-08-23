import {
    assertAuthorizedMediaResolution,
    type AuthorizedMediaResolution,
} from './contracts';

export const MEDIA_RESOLUTION_TTL_SECONDS = 300;

export interface AuthorizedMediaResolver {
    resolveAuthorizedMedia(input: {
        assetId: string;
    }): Promise<AuthorizedMediaResolution | null>;
}

/** Resolve only through the server-side authorization boundary. */
export async function resolveMediaForPlayback(
    resolver: AuthorizedMediaResolver,
    input: { assetId: string },
    now: number = Date.now(),
): Promise<AuthorizedMediaResolution | null> {
    const resolution = await resolver.resolveAuthorizedMedia(input);
    if (!resolution) return null;
    assertAuthorizedMediaResolution(resolution, now);
    return resolution;
}

export function isMediaResolutionLive(
    resolution: AuthorizedMediaResolution,
    now: number = Date.now(),
): boolean {
    return Boolean(resolution.url) && resolution.expiresAt > now;
}
