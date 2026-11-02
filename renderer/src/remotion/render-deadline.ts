/** Bounds the entire Remotion phase, including a browser that exits without
 * settling its pending protocol calls. Cleanup is also bounded. Late resource
 * acquisition is closed immediately and cannot resume a timed-out render. */
export async function withRenderDeadline<T>(
  timeoutMs: number,
  task: (scope: { check: () => void; cleanup: (fn: () => void | Promise<void>) => void }) => Promise<T>,
): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('Invalid render deadline.');
  let expired = false;
  const cleanups: Array<() => void | Promise<void>> = [];
  const pendingCleanups: Array<Promise<unknown>> = [];
  const error = new Error('RENDER_PROCESSING_TIMEOUT');
  const safely = (fn: () => void | Promise<void>) => { try { return Promise.resolve(fn()).catch(() => {}); } catch { return Promise.resolve(); } };
  let rejectDeadline!: (error: Error) => void;
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const timer = setTimeout(() => {
    expired = true;
    for (const cleanup of cleanups.splice(0)) pendingCleanups.push(safely(cleanup));
    rejectDeadline(error);
  }, timeoutMs);
  const scope = {
    check() { if (expired) throw error; },
    cleanup(fn: () => void | Promise<void>) { if (expired) void safely(fn); else cleanups.push(fn); },
  };
  try {
    return await Promise.race([Promise.resolve().then(() => task(scope)), deadline]);
  } finally {
    clearTimeout(timer);
    // Stop a late task from acquiring resources even after an ordinary failure.
    expired = true;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([...pendingCleanups, ...cleanups.splice(0).map(safely)]),
        new Promise<void>(resolve => { cleanupTimer = setTimeout(resolve, 1000); }),
      ]);
    } finally { if (cleanupTimer) clearTimeout(cleanupTimer); }
  }
}
