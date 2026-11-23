import type { StoryAction } from './story-actions';

export const PERFORMANCE_RETAKE = 'whole-shot-performance-v1';
export const performanceRetakeKey = (takeId: string) => `story-performance-retake:${takeId}`;

// Some stored cuts include up to three extra decoded frames. The original audio
// restoration workflow measures that difference before placing the recording.
export function performanceSeconds(seconds: number) {
  const native = Math.round(seconds);
  if (![4, 6, 8].includes(native) || Math.abs(seconds - native) > 3 / 24)
    throw new Error('PERFORMANCE_RETAKE_DURATION');
  return native;
}

export function performanceDirection(shot: string, actions: StoryAction[], missingActionIds: string[]) {
  const beats = actions.map(a =>
    `${missingActionIds.includes(a.id) ? "Required correction" : "Keep this beat"} — ${a.subject}: ${a.action}. Show it from ${a.startSeconds}s to ${a.endSeconds}s` +
    (a.beforeSeconds === null ? '.' : `, visibly before ${a.beforeSeconds}s.`));
  return [
    'Stage a fresh performance from the approved opening picture. Keep the cast, clothing and setting recognizable.',
    'Animate the whole character. For facial actions, draw the head, jaw, cheeks and neck together. Do not slide a patch across a still face. Use a motivated reaction close-up when helpful.',
    'The original recording will be restored. Keep who speaks, turns of speech and reactions in their original order. Produce a silent picture.',
    shot, ...beats,
  ].join('\n');
}
