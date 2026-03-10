/**
 * FinalFrame — Project State Machine
 * Reference: MASTER_PRD.md § 8 — Project States (Strict State Machine)
 * 
 * State machine:
 * draft → blueprint_ready → approved → rendering → rendered → exported → archived
 * 
 * Transitions outside this order are forbidden.
 */

import type { ProjectState } from '@/lib/types/database';

/**
 * Valid state transitions map
 * Each state maps to an array of states it can transition TO
 * 
 * Reference: MASTER_PRD.md § 8
 * "Transitions outside this order are forbidden."
 */
const STATE_TRANSITIONS: Record<ProjectState, ProjectState[]> = {
    draft: ['blueprint_ready'],
    blueprint_ready: ['approved', 'draft'], // Can go back to draft for edits
    approved: ['rendering'],
    rendering: ['rendered', 'draft', 'approved'], // Can fail and return to draft, or reset to approved
    rendered: ['exported', 'draft'], // Can return to draft for remix
    exported: ['archived'],
    archived: [], // Terminal state
};

/**
 * State descriptions for UI display
 */
export const STATE_LABELS: Record<ProjectState, string> = {
    draft: 'Draft',
    blueprint_ready: 'Blueprint Ready',
    approved: 'Approved',
    rendering: 'Rendering',
    rendered: 'Rendered',
    exported: 'Exported',
    archived: 'Archived',
};

/**
 * State descriptions
 */
export const STATE_DESCRIPTIONS: Record<ProjectState, string> = {
    draft: 'Project is being edited',
    blueprint_ready: 'AI Director Blueprint is ready for review',
    approved: 'Blueprint approved, ready for rendering',
    rendering: 'Video is being generated',
    rendered: 'Video generation complete',
    exported: 'Video has been exported',
    archived: 'Project has been archived',
};

/**
 * Ordered list of all project states
 * Reference: MASTER_PRD.md § 8
 */
export const PROJECT_STATE_ORDER: ProjectState[] = [
    'draft',
    'blueprint_ready',
    'approved',
    'rendering',
    'rendered',
    'exported',
    'archived',
];

/**
 * Check if a state transition is valid
 * 
 * @param from - Current project state
 * @param to - Target project state
 * @returns true if the transition is allowed
 * 
 * Reference: MASTER_PRD.md § 8 — "Transitions outside this order are forbidden."
 */
export function isValidTransition(from: ProjectState, to: ProjectState): boolean {
    const allowedTransitions = STATE_TRANSITIONS[from];
    return allowedTransitions.includes(to);
}

/**
 * Get valid next states from current state
 * 
 * @param currentState - Current project state
 * @returns Array of valid next states
 */
export function getValidNextStates(currentState: ProjectState): ProjectState[] {
    return STATE_TRANSITIONS[currentState];
}

/**
 * Error thrown when an invalid state transition is attempted
 */
export class InvalidStateTransitionError extends Error {
    public readonly from: ProjectState;
    public readonly to: ProjectState;

    constructor(from: ProjectState, to: ProjectState) {
        super(
            `Invalid state transition: Cannot transition from "${from}" to "${to}". ` +
            `Valid transitions from "${from}": [${STATE_TRANSITIONS[from].join(', ')}]`
        );
        this.name = 'InvalidStateTransitionError';
        this.from = from;
        this.to = to;
    }
}

/**
 * Validate and return the new state, or throw if invalid
 * 
 * @param from - Current project state
 * @param to - Target project state
 * @returns The target state if valid
 * @throws InvalidStateTransitionError if transition is not allowed
 * 
 * Reference: MASTER_PRD.md § 8 — Strict state machine enforcement
 */
export function validateTransition(from: ProjectState, to: ProjectState): ProjectState {
    if (!isValidTransition(from, to)) {
        throw new InvalidStateTransitionError(from, to);
    }
    return to;
}

/**
 * Get the index of a state in the project lifecycle
 * Useful for progress indicators
 */
export function getStateIndex(state: ProjectState): number {
    return PROJECT_STATE_ORDER.indexOf(state);
}

/**
 * Check if a project has reached or passed a certain state
 */
export function hasReachedState(currentState: ProjectState, targetState: ProjectState): boolean {
    return getStateIndex(currentState) >= getStateIndex(targetState);
}

/**
 * Check if project can be edited (only in draft or blueprint_ready)
 * Reference: MASTER_PRD.md — Blueprint editing is only in planning stage
 */
export function canEdit(state: ProjectState): boolean {
    return state === 'draft' || state === 'blueprint_ready';
}

/**
 * Check if project can be rendered
 * Reference: BUILD_PHASES.md — Phase 2 exit rule: Rendering is impossible unless blueprint is approved
 */
export function canRender(state: ProjectState): boolean {
    return state === 'approved';
}

/**
 * Check if project can be exported
 * Reference: MASTER_PRD.md § 10 — Quality Gates (Export Blockers)
 */
export function canExport(state: ProjectState): boolean {
    return state === 'rendered';
}
