import { MOVIE_ERROR_MESSAGES } from '../../../renderer/src/movie/messages';

export function movieIssue(code: string): string {
  if (MOVIE_ERROR_MESSAGES[code]) return MOVIE_ERROR_MESSAGES[code];
  if (code === 'MOVIE_AUTHORITY_BUDGET') return 'This version has too much source metadata for one safe approval check. Use simpler components or separate chapter exports.';
  if (code.includes('ABI') || code === 'MOVIE_CONFIGURATION_REQUIRED') return 'Movie rendering is awaiting a compatible worker. Existing versions and completed components are retained.';
  if (code.includes('RECONCILIATION') || code.includes('RECOVERY_WINDOW')) return 'The worker accepted this job. An operator must recover its retained result before another attempt.';
  if (code.includes('SOURCE')) return 'A source needs verification. Check its exact timeline lock, media approval, rights and stored bytes, then create a corrected version or retry.';
  if (code.includes('HANDOFF')) return 'The worker could not confirm this handoff. Saved components are retained; check its current status before retrying.';
  return 'This movie could not finish. Saved versions and completed components are retained for review.';
}
