import type { CreateIntent, DirectorPlan, QualityGateResult, ShotSpec } from '../types';

export type PlanQualityIssue = {
    code:
        | 'DURATION_MISMATCH'
        | 'NO_SHOTS'
        | 'DUPLICATE_SHOT'
        | 'GENERIC_SHOT'
        | 'UNKNOWN_DIALOGUE_SEGMENT'
        | 'EMPTY_SHOT_PURPOSE'
        | 'MISSING_CONTINUITY_RULES'
        | 'APPROVAL_WITHOUT_COST'
        | 'PREMATURE_GENERATION';
    severity: 'ERROR' | 'WARNING';
    message: string;
    path?: string;
};

export type PlanQualityReport = {
    ok: boolean;
    issues: PlanQualityIssue[];
    totalShotSeconds: number;
    dialogueCoverageSeconds: number;
};

const DURATION_TOLERANCE_SECONDS = 2;
const GENERIC_SHOT_PHRASES = [
    'show the scene',
    'things happen',
    'a cinematic scene with nice lighting and interesting visuals',
    'interesting visuals',
];

function normalized(value: string): string {
    return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function shotFingerprint(shot: ShotSpec): string {
    return [shot.purpose, shot.action, shot.prompt].map(normalized).join('|');
}

/**
 * Performs deterministic checks that protect the production graph from
 * generic, duplicated, untimed, or prematurely approved plans. It never
 * calls a provider and is safe to run again before persistence.
 */
export function inspectPlanQuality(plan: DirectorPlan, intent?: CreateIntent): PlanQualityReport {
    const issues: PlanQualityIssue[] = [];
    const totalShotSeconds = plan.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
    const dialogueCoverageSeconds = plan.speakers.reduce(
        (sum, segment) => sum + Math.max(0, segment.endSeconds - segment.startSeconds),
        0,
    );

    if (plan.shots.length === 0) {
        issues.push({ code: 'NO_SHOTS', severity: 'ERROR', message: 'The plan must contain at least one independently generatable shot.' });
    }

    if (Math.abs(totalShotSeconds - plan.durationSeconds) > DURATION_TOLERANCE_SECONDS) {
        issues.push({
            code: 'DURATION_MISMATCH',
            severity: 'ERROR',
            message: `Shot duration (${totalShotSeconds.toFixed(2)}s) must stay within ${DURATION_TOLERANCE_SECONDS}s of the plan duration (${plan.durationSeconds.toFixed(2)}s).`,
            path: 'shots',
        });
    }

    const fingerprints = new Map<string, number>();
    plan.shots.forEach((shot, index) => {
        const fingerprint = shotFingerprint(shot);
        const previousIndex = fingerprints.get(fingerprint);
        if (previousIndex !== undefined) {
            issues.push({
                code: 'DUPLICATE_SHOT',
                severity: 'ERROR',
                message: `Shot ${index + 1} duplicates shot ${previousIndex + 1}; each shot needs a distinct purpose or action.`,
                path: `shots[${index}]`,
            });
        } else {
            fingerprints.set(fingerprint, index);
        }

        if (!shot.purpose.trim()) {
            issues.push({ code: 'EMPTY_SHOT_PURPOSE', severity: 'ERROR', message: 'Every shot needs a clear story purpose.', path: `shots[${index}].purpose` });
        }

        const shotText = [shot.purpose, shot.action, shot.prompt].map(normalized).join(' ');
        const genericPhraseCount = GENERIC_SHOT_PHRASES.filter((phrase) => shotText.includes(phrase)).length;
        if (genericPhraseCount >= 2 || shot.purpose.trim().toLowerCase() === 'show the scene') {
            issues.push({
                code: 'GENERIC_SHOT',
                severity: 'ERROR',
                message: `Shot ${index + 1} is too generic; describe the specific story purpose, action, and visual subject.`,
                path: `shots[${index}]`,
            });
        }

    });

    const speakerIds = new Set(plan.speakers.map((segment) => segment.id));
    plan.shots.forEach((shot, shotIndex) => {
        shot.dialogueSegmentIds.forEach((segmentId) => {
            if (!speakerIds.has(segmentId)) {
                issues.push({
                    code: 'UNKNOWN_DIALOGUE_SEGMENT',
                    severity: 'ERROR',
                    message: `Shot references dialogue segment ${segmentId}, but that segment is not in the plan.`,
                    path: `shots[${shotIndex}].dialogueSegmentIds`,
                });
            }
        });
    });

    if (plan.creativeGuide.continuityRules.length === 0) {
        issues.push({ code: 'MISSING_CONTINUITY_RULES', severity: 'ERROR', message: 'The creative guide must define at least one continuity rule.', path: 'creativeGuide.continuityRules' });
    }

    if (plan.approvalStatus === 'APPROVED' && plan.estimatedCredits <= 0) {
        issues.push({ code: 'APPROVAL_WITHOUT_COST', severity: 'ERROR', message: 'An approved plan must have a non-zero cost estimate.' });
    }

    if (plan.approvalStatus === 'APPROVED' && plan.currentStage === 'PLAN') {
        issues.push({ code: 'PREMATURE_GENERATION', severity: 'WARNING', message: 'An approved plan should advance beyond the planning stage before shot generation.' });
    }

    if (intent && Math.abs(intent.durationSeconds - plan.durationSeconds) > DURATION_TOLERANCE_SECONDS) {
        issues.push({ code: 'DURATION_MISMATCH', severity: 'ERROR', message: 'The Director plan duration does not match the approved creation intent.', path: 'durationSeconds' });
    }

    return {
        ok: issues.every((issue) => issue.severity !== 'ERROR'),
        issues,
        totalShotSeconds,
        dialogueCoverageSeconds,
    };
}

export function assertPlanQuality(plan: DirectorPlan, intent?: CreateIntent): DirectorPlan {
    const report = inspectPlanQuality(plan, intent);
    if (!report.ok) {
        const details = report.issues.filter((issue) => issue.severity === 'ERROR');
        throw new Error(`Director plan quality check failed: ${details.map((issue) => issue.message).join(' ')}`);
    }
    return plan;
}

export function hasBlockingQualityGate(result: QualityGateResult): boolean {
    return result.status === 'BLOCKED' || result.status === 'REQUIRES_HUMAN_REVIEW' || result.evidence.some((item) => item.result === 'FAIL');
}
