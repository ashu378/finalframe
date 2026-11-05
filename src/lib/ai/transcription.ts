/** Provider timestamps are evidence, never a duration-based text estimate. */
export const TRANSCRIPT_SEGMENT_REQUEST = {
    version: 'PROVIDER_SEGMENTS_V1',
    responseFormat: 'verbose_json',
    timestampGranularities: ['segment'],
} as const;

export function transcriptRequestOptions(value: unknown) {
    if (value === undefined || value === null) return undefined; // retained legacy job
    const row = value as Record<string, unknown>;
    if (row.version !== TRANSCRIPT_SEGMENT_REQUEST.version || row.responseFormat !== 'verbose_json'
        || !Array.isArray(row.timestampGranularities) || row.timestampGranularities.length !== 1 || row.timestampGranularities[0] !== 'segment') {
        throw new Error('TRANSCRIPT_REQUEST_CHANGED');
    }
    return { ...TRANSCRIPT_SEGMENT_REQUEST, timestampGranularities: ['segment'] as ['segment'] };
}

export type TranscriptAlignmentStatus = 'TIMED_SEGMENTS' | 'TEXT_ONLY' | 'NO_SPEECH';
export interface TranscriptSegment { start: number; end: number; text: string }
export interface TranscriptAlignment {
    version: 'PROVIDER_SEGMENTS_V1';
    status: TranscriptAlignmentStatus;
    reason?: 'TIMESTAMPS_UNAVAILABLE' | 'TIMESTAMPS_INVALID';
    sourceDurationSeconds: number;
    granularity: 'segment';
}

/** A bad alignment must not discard already-paid text or invent replacement
 * timings. The result remains reviewable; automatic captions must stop. */
export function normalizeTranscriptSegments(text: string, value: unknown, durationSeconds: number) {
    if (typeof text !== 'string' || text.length > 100_000 || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 60) throw new Error('TRANSCRIPT_OUTPUT_INVALID');
    const alignment: TranscriptAlignment = { version: 'PROVIDER_SEGMENTS_V1', status: 'TEXT_ONLY', sourceDurationSeconds: durationSeconds, granularity: 'segment' };
    const unavailable = (reason: TranscriptAlignment['reason']) => ({ segments: [] as TranscriptSegment[], alignment: { ...alignment, reason } });
    if (value === undefined || value === null || Array.isArray(value) && value.length === 0) {
        return !text.trim() ? { segments: [] as TranscriptSegment[], alignment: { ...alignment, status: 'NO_SPEECH' as const } } : unavailable('TIMESTAMPS_UNAVAILABLE');
    }
    if (!text.trim() || !Array.isArray(value) || value.length > 1000) return unavailable('TIMESTAMPS_INVALID');
    const segments: TranscriptSegment[] = [];
    let previousEnd = 0, characters = 0;
    for (const raw of value) {
        if (!raw || typeof raw !== 'object') return unavailable('TIMESTAMPS_INVALID');
        const { start, end, text: words } = raw as Record<string, unknown>;
        if (typeof start !== 'number' || !Number.isFinite(start) || start < previousEnd || typeof end !== 'number' || !Number.isFinite(end)
            || start < 0 || end <= start || end > durationSeconds || typeof words !== 'string' || !words.trim()) return unavailable('TIMESTAMPS_INVALID');
        characters += words.length;
        if (characters > 100_000) return unavailable('TIMESTAMPS_INVALID');
        segments.push({ start, end, text: words });
        previousEnd = end;
    }
    return { segments, alignment: { ...alignment, status: 'TIMED_SEGMENTS' as const } };
}

export function transcriptAlignmentMessage(status: unknown) {
    return status === 'TIMED_SEGMENTS' ? 'Provider-timed phrase segments are saved. Review their timing before using captions.'
        : status === 'NO_SPEECH' ? 'The transcription returned no speech. No caption timing was invented.'
        : 'Transcript text is saved, but usable provider timestamps are unavailable. Review and enter caption timing before continuing; no automatic retry was made.';
}
