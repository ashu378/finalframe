/** Observable story beats, not a claim that a provider obeyed its prompt. */
export type StoryAction = { id: string; subject: string; action: string; startSeconds: number; endSeconds: number; beforeSeconds: number | null };
export type StoryActionObservation = { actionId: string; result: 'PASS' | 'FAIL'; observedStartSeconds: number | null; observedEndSeconds: number | null; evidence: string };
export function parseStoryActions(value: unknown, durationSeconds: number): StoryAction[] {
    if (value === undefined) return []; // Retained plans remain readable.
    if (!Array.isArray(value) || value.length > 16) throw new Error('Use at most 16 visible story actions per shot.');
    const ids = new Set<string>();
    return value.map(item => {
        if (!item || typeof item !== 'object') throw new Error('Describe each visible story action.');
        const a = item as StoryAction;
        for (const [name, max] of [['id', 64], ['subject', 200], ['action', 1000]] as const) if (typeof a[name] !== 'string' || !a[name].trim() || a[name].length > max) throw new Error('Give each story action an ID, subject and visible action.');
        if (ids.has(a.id)) throw new Error('Story action IDs must be unique.'); ids.add(a.id);
        if (!Number.isFinite(durationSeconds) || !Number.isFinite(a.startSeconds) || !Number.isFinite(a.endSeconds) || a.startSeconds < 0 || a.endSeconds <= a.startSeconds || a.endSeconds > durationSeconds) throw new Error('Story action timing must fit inside its shot.');
        if (a.beforeSeconds !== null && (!Number.isFinite(a.beforeSeconds) || a.beforeSeconds <= a.startSeconds || a.beforeSeconds > durationSeconds)) throw new Error('The action must be visible before its story deadline.');
        return {id:a.id,subject:a.subject,action:a.action,startSeconds:a.startSeconds,endSeconds:a.endSeconds,beforeSeconds:a.beforeSeconds};
    });
}
export function validateStoryActionObservations(actions: StoryAction[], observations: StoryActionObservation[]) {
    if (observations.length !== actions.length || new Set(observations.map(o => o.actionId)).size !== actions.length) throw new Error('Review every required story action exactly once.');
    for (const a of actions) {
        const o = observations.find(o => o.actionId === a.id);
        if (!o || !['PASS','FAIL'].includes(o.result) || typeof o.evidence !== 'string' || o.evidence.trim().length < 12 || o.evidence.length > 2000) throw new Error('Describe what you saw for each action, including missing actions.');
        if (o.result === 'PASS' && (typeof o.observedStartSeconds !== 'number' || typeof o.observedEndSeconds !== 'number' || !Number.isFinite(o.observedStartSeconds) || !Number.isFinite(o.observedEndSeconds) || o.observedStartSeconds < a.startSeconds || o.observedEndSeconds > a.endSeconds || o.observedEndSeconds <= o.observedStartSeconds || a.beforeSeconds !== null && o.observedStartSeconds >= a.beforeSeconds)) throw new Error('A passing action needs observed timing inside its required window and before its story deadline.');
    }
    return observations.every(o => o.result === 'PASS');
}
export function storyActionPrompt(actions: StoryAction[]) {
    return actions.length ? '\nRequired visible story actions (dialogue alone does not satisfy these):\n' + actions.map(a => `${a.id}: ${a.subject}: ${a.action} Visible between ${a.startSeconds}s and ${a.endSeconds}s${a.beforeSeconds === null ? '' : `; must begin BEFORE ${a.beforeSeconds}s`}.`).join('\n') : '';
}
