/** Offline-only validation. Credentials are supplied by the coordinator. */
export function onlineTeamConfiguration(env) {
  if (env.FINALFRAME_ALLOW_TEAM_ONLINE_TESTS !== 'true') throw new Error('Explicit team online-test opt-in is required.');
  if (env.NEXT_PUBLIC_CONVEX_URL?.replace(/\/$/, '') !== 'https://knowing-snail-785.convex.cloud') throw new Error('This fixture driver is pinned to the approved knowing-snail-785 cloud deployment.');
  const runId = env.FINALFRAME_TEAM_RUN_ID;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(runId || '')) throw new Error('A fresh lowercase UUID run ID is required.');
  const actors = {};
  for (const key of ['a', 'b', 'c']) {
    const email = env[`FINALFRAME_TEAM_${key.toUpperCase()}_EMAIL`]?.trim().toLowerCase();
    const password = env[`FINALFRAME_TEAM_${key.toUpperCase()}_PASSWORD`];
    if (email !== `finalframe-b04-${key}-${runId}@example.test` || !password || password.length < 12) throw new Error('Supply three dedicated UUID-scoped fixture emails and separate private passwords of at least12 characters.');
    actors[key] = { email, password };
  }
  if (new Set(Object.values(actors).map(actor => actor.password)).size !== 3) throw new Error('Each disposable fixture must have a separate supplied password.');
  return { url: 'https://knowing-snail-785.convex.cloud', deployment: 'knowing-snail-785', runId, actors, cleanupOnly: env.FINALFRAME_TEAM_CLEANUP_ONLY === 'true', stateFile: env.FINALFRAME_TEAM_STATE_FILE || `/tmp/finalframe-b04-${runId}.json` };
}
