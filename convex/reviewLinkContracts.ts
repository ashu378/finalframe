export const REVIEW_LINK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const REVIEW_LINK_DEFAULT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const REVIEW_COMMENT_LIMIT = 200;
export function isReviewLinkActive(link: { expiresAt: number; revokedAt?: number }, now = Date.now()) {
  return link.revokedAt === undefined && Number.isFinite(link.expiresAt) && link.expiresAt > now;
}
export function assertReviewToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('This review link is unavailable.');
}
export function validateReviewComment(input: { authorName: string; body: string; timeSeconds?: number; durationSeconds: number; requestId: string }) {
  const authorName = input.authorName.trim(); const body = input.body.trim();
  if (!authorName || authorName.length > 100 || !body || body.length > 10_000) throw new Error('Enter your name and a comment of up to 10,000 characters.');
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestId)) throw new Error('A valid comment request ID is required.');
  if (input.timeSeconds !== undefined && (!Number.isFinite(input.timeSeconds) || input.timeSeconds < 0 || input.timeSeconds > input.durationSeconds)) throw new Error('Comment timestamp must be inside this video.');
  return { authorName, body };
}
