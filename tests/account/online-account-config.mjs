/** Pure configuration validation: importing this file never contacts Convex. */
export function onlineAccountConfiguration(env) {
  if (env.FINALFRAME_ALLOW_ACCOUNT_ONLINE_TESTS !== 'true') throw new Error('Explicit online account-test opt-in is required.');
  let url;
  try { url = new URL(env.NEXT_PUBLIC_CONVEX_URL || ''); } catch { throw new Error('An exact online Convex cloud deployment URL is required.'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.convex\.cloud$/.test(url.hostname) || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use the exact HTTPS Convex cloud deployment origin, without custom host, port, path or credentials.');
  const runId = env.FINALFRAME_ACCOUNT_FIXTURE_RUN_ID;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(runId || '')) throw new Error('Supply a unique UUID for this dedicated account fixture run.');
  const fixtureEmail = env.FINALFRAME_ACCOUNT_FIXTURE_EMAIL?.trim().toLowerCase();
  if (![`finalframe-b03-fixture-${runId}@example.test`, `finalframe-b03-fixture-${runId}@finalframe.fixture.invalid`].includes(fixtureEmail)) throw new Error('The fixture email must use the dedicated B03 prefix, exact run UUID and approved test domain.');
  const fixturePassword = env.FINALFRAME_ACCOUNT_FIXTURE_PASSWORD;
  const adminEmail = env.FINALFRAME_ACCOUNT_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = env.FINALFRAME_ACCOUNT_ADMIN_PASSWORD;
  if (!fixturePassword || fixturePassword.length < 12 || !adminEmail || !adminPassword) throw new Error('Supply the private dedicated fixture and platform administrator credentials. This driver never generates credentials.');
  if (adminEmail === fixtureEmail || fixturePassword === adminPassword) throw new Error('The disposable fixture and real administrator must use separate accounts and credentials.');
  return { url: url.origin, deployment: url.hostname.replace('.convex.cloud', ''), runId, fixtureEmail, fixturePassword, adminEmail, adminPassword, expectedAdminUserId: env.FINALFRAME_ACCOUNT_ADMIN_USER_ID || null, cleanupOnly: env.FINALFRAME_ACCOUNT_FIXTURE_CLEANUP_ONLY === 'true', stateFile: env.FINALFRAME_ACCOUNT_FIXTURE_STATE_FILE || `/tmp/finalframe-b03-${runId}.json` };
}
