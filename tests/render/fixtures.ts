import type { AssemblyManifest, AudioMix, CaptionTrack, RenderPreset, TimelineTrack, TimelineVersion } from '../../src/lib/render/contracts';

export const validRenderPreset: RenderPreset = {
    id: 'preset-social-1080',
    name: 'Social 1080p',
    platform: 'REELS',
    width: 1080,
    height: 1920,
    frameRate: 30,
    container: 'MP4',
    videoCodec: 'H264',
    audioCodec: 'AAC',
    audioSampleRateHz: 48_000,
    audioChannels: 2,
    videoBitrateKbps: 8_000,
    maxDurationSeconds: 90,
    includeCaptions: true,
    burnInCaptions: true,
};

export const validCaptionTrack: CaptionTrack = {
    id: 'captions-1',
    language: 'en',
    format: 'BURN_IN',
    source: 'TRANSCRIPT',
    version: 1,
    style: {
        fontFamily: 'Inter',
        fontSize: 48,
        color: '#FFFFFF',
        backgroundColor: '#00000099',
        position: 'BOTTOM',
        safeAreaPercent: 8,
    },
    cues: [
        { id: 'cue-1', startSeconds: 0, endSeconds: 2.4, text: 'Make the video in your head.' },
    ],
};

export const validAudioMix: AudioMix = {
    id: 'mix-1',
    sampleRateHz: 48_000,
    channels: 2,
    loudnessTargetLufs: -14,
    truePeakLimitDbtp: -1,
    tracks: [
        {
            id: 'audio-1',
            sourceClipId: 'clip-voice',
            media: { assetId: 'asset-voice', storageId: 'storage-voice', mimeType: 'audio/mpeg' },
            role: 'VOICEOVER',
            gainDb: 0,
            pan: 0,
            muted: false,
            duckingGroup: 'dialogue',
        },
    ],
};

export const validTracks: TimelineTrack[] = [
    {
        id: 'track-video',
        kind: 'VIDEO',
        name: 'Main video',
        orderIndex: 0,
        muted: false,
        locked: false,
        clips: [
            {
                id: 'clip-video',
                trackId: 'track-video',
                kind: 'VIDEO',
                startSeconds: 0,
                durationSeconds: 2.4,
                media: { assetId: 'asset-video', storageId: 'storage-video', mimeType: 'video/mp4' },
                fit: 'cover',
            },
        ],
    },
    {
        id: 'track-captions',
        kind: 'CAPTIONS',
        name: 'Captions',
        orderIndex: 1,
        muted: false,
        locked: true,
        clips: [
            {
                id: 'clip-captions',
                trackId: 'track-captions',
                kind: 'CAPTIONS',
                startSeconds: 0,
                durationSeconds: 2.4,
                captionTrackId: validCaptionTrack.id,
            },
        ],
    },
];

export const validTimeline: TimelineVersion = {
    id: 'timeline-1',
    productionId: 'production-1',
    version: 1,
    status: 'READY_FOR_REVIEW',
    width: validRenderPreset.width,
    height: validRenderPreset.height,
    frameRate: validRenderPreset.frameRate,
    durationSeconds: 2.4,
    tracks: validTracks,
    captionTrackIds: [validCaptionTrack.id],
    audioMixId: validAudioMix.id,
    createdAt: '2026-08-25T00:00:00.000Z',
    createdBy: 'user-1',
};

export const validAssemblyManifest: AssemblyManifest = {
    id: 'manifest-1',
    productionId: validTimeline.productionId,
    timelineVersionId: validTimeline.id,
    version: 1,
    tracks: validTracks,
    captionTracks: [validCaptionTrack],
    audioMix: validAudioMix,
    renderPreset: validRenderPreset,
    sourceAssetIds: ['asset-video', 'asset-voice'],
    durationSeconds: validTimeline.durationSeconds,
    createdAt: '2026-08-25T00:00:00.000Z',
    createdBy: 'user-1',
    manifestChecksum: 'sha256:manifest-1',
};
