import { MOVIE_ERROR_MESSAGES } from '../../../renderer/src/movie/messages';

export function movieIssue(code: string): string {
  if (MOVIE_ERROR_MESSAGES[code]) return MOVIE_ERROR_MESSAGES[code];
  if (code === 'MOVIE_AUTHORITY_BUDGET') return 'This version has too much source information for one safe approval check. Use fewer parts or separate chapter exports.';
  if (code.includes('ABI') || code === 'MOVIE_CONFIGURATION_REQUIRED') return 'Movie rendering is awaiting a compatible worker. Saved versions and finished parts remain available.';
  if (code.includes('RECONCILIATION') || code.includes('RECOVERY_WINDOW')) return 'The renderer accepted this job. An administrator must recover its saved result before another attempt.';
  if (code.includes('SOURCE')) return 'A source needs to be checked. Confirm its timeline is locked, its media is approved, and its files and usage rights are still available. Then create a corrected version or retry.';
  if (code.includes('HANDOFF')) return 'The renderer could not confirm this job. Saved parts remain available. Check its current status before retrying.';
  return 'This movie could not finish. Saved versions and finished parts remain available to review.';
}
