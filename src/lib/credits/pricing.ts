/** Internal test credits are not provider USD or a payment price. */
export const VIDEO_CREDITS_PER_SECOND = { ECONOMY: 8, STANDARD: 16, PREMIUM: 32 } as const;

export function estimateGenerationCredits(input: { durationSeconds: number; qualityTier: string }) {
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > 60) throw new Error('Shot duration must be between zero and 60 seconds.');
  if (!Object.prototype.hasOwnProperty.call(VIDEO_CREDITS_PER_SECOND, input.qualityTier)) throw new Error('Unsupported generation quality tier.');
  return Math.ceil(input.durationSeconds) * VIDEO_CREDITS_PER_SECOND[input.qualityTier as keyof typeof VIDEO_CREDITS_PER_SECOND];
}
