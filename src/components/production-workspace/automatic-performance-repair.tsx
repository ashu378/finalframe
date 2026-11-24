'use client';

import { useRef, useState } from 'react';
import { useAction, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import { useParams, useSearchParams } from 'next/navigation';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { decodeProjectRouteId } from '@/lib/project/route-id';

type TakeId = Id<'shotVersions'>;
type Estimate = { quoteKey: string; maximumCostUsd: number; candidateCount: number };
type Result =
  | {status: 'SAVED'; shotId: Id<'shots'>; shotVersionId: TakeId; assetId: Id<'assets'>}
  | {status: 'NO_MATCH' | 'FAILED' | 'QUEUED' | 'RUNNING'; message?: string};

const estimateRef = makeFunctionReference<'action', {takeId: TakeId}, Estimate>('automaticPerformanceRepair:estimate');
const launchRef = makeFunctionReference<'action', {takeId: TakeId; quoteKey: string}, Result>('automaticPerformanceRepair:launch');
const statusRef = makeFunctionReference<'query', {takeId: TakeId}, Result | null>('automaticPerformanceRepair:status');

export function AutomaticPerformanceRepair({takeId}: {takeId: TakeId}) {
  const estimate = useAction(estimateRef);
  const launch = useAction(launchRef);
  const result = useQuery(statusRef, {takeId});
  const searching = result?.status === 'QUEUED' || result?.status === 'RUNNING';
  const {id:projectId} = useParams<{id:string}>();
  const search = useSearchParams();
  const pending = useRef(false);
  const [phase, setPhase] = useState<'idle' | 'pricing' | 'finding'>('idle');
  const [quote, setQuote] = useState<Estimate | null>(null);
  const [error, setError] = useState('');

  async function findAndFix() {
    if (pending.current || searching || result === undefined) return;
    pending.current = true;
    setError('');
    try {
      let authorized = quote;
      if (!authorized) {
        setPhase('pricing');
        authorized = await estimate({takeId});
        if (!Number.isFinite(authorized.maximumCostUsd) || authorized.maximumCostUsd < 0) {
          throw new Error('Invalid estimate');
        }
        if (authorized.maximumCostUsd > 0) {
          setQuote(authorized);
          return;
        }
      }
      setPhase('finding');
      await launch({takeId, quoteKey: authorized.quoteKey});
      setQuote(null);
    } catch (cause) {
      setQuote(null);
      setError(cause instanceof ConvexError && typeof cause.data === 'string'
        ? cause.data : 'Could not finish the search. Check the saved take and try again to resume.');
    } finally {
      pending.current = false;
      setPhase('idle');
    }
  }

  function reviewHref(saved: Extract<Result, {status: 'SAVED'}>) {
    const query = new URLSearchParams();
    const production = search.get('production');
    if (production) query.set('production', production);
    query.set('clipStep', 'review');
    query.set('shot', saved.shotId);
    query.set('take', saved.shotVersionId);
    return `/dashboard/projects/${encodeURIComponent(decodeProjectRouteId(projectId))}/workspace/takes?${query}`;
  }

  return <section aria-label="Automatic shot repair" className="space-y-3 rounded-lg border border-border p-3">
    <h6 className="font-semibold">Find footage for this action</h6>
    <p className="text-sm text-muted-foreground">FinalFrame looks through approved clips in this project for the same character doing the missing action. It fits the movement into this shot and keeps the original recording.</p>
    {result?.status === 'SAVED' ? <>
      <p role="status" className="text-sm">The repaired take is ready. Review the movement and listen to the voices before approving it.</p>
      <a className="ff-button-primary" href={reviewHref(result)}>Review repaired take</a>
    </> : searching ? <p role="status" className="text-sm">FinalFrame is checking the footage and preparing your edit. You can leave this page and return to review it.</p> : <>
      {result?.status === 'NO_MATCH' && <p role="status" className="text-sm">{result.message || 'No matching performance was found. Add another approved clip to the project to try again.'}</p>}
      {result?.status === 'FAILED' && <p role="alert" className="text-sm">{result.message || 'The search stopped. Check the estimate to see whether it can resume.'}</p>}
      {quote && <p className="text-sm">Inspect up to {quote.candidateCount} project {quote.candidateCount === 1 ? 'clip' : 'clips'} for up to ${quote.maximumCostUsd.toFixed(4)}.</p>}
      {phase !== 'idle' && <p role="status" className="text-sm">{phase === 'pricing' ? 'Checking available footage and cost…' : 'Finding the action and preparing a new take…'}</p>}
      <Button type="button" disabled={phase !== 'idle' || result === undefined} onClick={() => void findAndFix()}>
        {quote ? 'Confirm search and repair' : 'Find footage and fix this shot'}
      </Button>
    </>}
    {error && !searching && result?.status !== 'SAVED' && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
