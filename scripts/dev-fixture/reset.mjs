import { readFile } from 'node:fs/promises';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';
import { requireOnlineConvexUrl } from './client.mjs';

const url = requireOnlineConvexUrl();
if (process.env.FINALFRAME_DEV_FIXTURES !== 'true' || process.env.FINALFRAME_DEV_FIXTURE_ENV !== 'development') throw new Error('Fixture reset requires the explicit development fixture flags.');
const key = process.env.FINALFRAME_DEV_FIXTURE_KEY;
if (!key) throw new Error('FINALFRAME_DEV_FIXTURE_KEY is required.');
let token = process.env.FINALFRAME_TEST_AUTH_TOKEN;
if (!token) {
  try {
    const state = JSON.parse(await readFile(process.env.FINALFRAME_FIXTURE_STATE_FILE || '/tmp/finalframe-fixture-run.json', 'utf8'));
    token = state.authToken;
  } catch {
    // Report a clear error below rather than silently using an unauthenticated client.
  }
}
if (!token) throw new Error('Set FINALFRAME_TEST_AUTH_TOKEN or run the seed first so the local fixture state file contains an auth token.');
const client = new ConvexHttpClient(url);
client.setAuth(token);
const result = await client.mutation(api.devFixtures.reset, { fixtureKey: key, projectExternalId: process.env.FINALFRAME_FIXTURE_PROJECT_EXTERNAL_ID || 'finalframe_dev_fixture_v1', confirm: 'RETAIN_FINALFRAME_DEV_FIXTURES' });
console.log(JSON.stringify({ ...result, authAccountRetained: true }, null, 2));
