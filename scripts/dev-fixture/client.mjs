import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';

/**
 * The live fixture is intentionally cloud-only. A local Convex URL would make
 * the verification report misleading and could accidentally exercise a stale
 * schema, so reject it before creating a client.
 */
export function requireOnlineConvexUrl(value = process.env.NEXT_PUBLIC_CONVEX_URL) {
  if (!value) throw new Error('NEXT_PUBLIC_CONVEX_URL is required and must point to the online Convex deployment.');
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('NEXT_PUBLIC_CONVEX_URL must be a valid HTTPS URL for the online Convex deployment.'); }
  if (parsed.protocol !== 'https:' || /^(localhost|127(?:\.\d+){3}|0\.0\.0\.0)$/i.test(parsed.hostname)) {
    throw new Error(`Online Convex deployment required; refusing local URL: ${value}`);
  }
  return value.replace(/\/$/, '');
}

export async function createAuthenticatedClient() {
  const url = requireOnlineConvexUrl();
  const client = new ConvexHttpClient(url);
  const suppliedToken = process.env.FINALFRAME_TEST_AUTH_TOKEN?.trim();
  if (suppliedToken) {
    client.setAuth(suppliedToken);
    await client.mutation(api.account.ensureAccount, { name: process.env.FINALFRAME_FIXTURE_OWNER_NAME?.trim() || 'FinalFrame Fixture Owner' });
    return { client, token: suppliedToken, auth: { mode: 'token' } };
  }
  const email = process.env.FINALFRAME_FIXTURE_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.FINALFRAME_FIXTURE_OWNER_PASSWORD;
  const name = process.env.FINALFRAME_FIXTURE_OWNER_NAME?.trim() || 'FinalFrame Fixture Owner';
  if (!email || !password) throw new Error('Set FINALFRAME_FIXTURE_OWNER_EMAIL and FINALFRAME_FIXTURE_OWNER_PASSWORD.');
  let lastError;
  for (const flow of ['signIn', 'signUp']) {
    try {
      const result = await client.action(api.auth.signIn, { provider: 'password', params: { flow, email, password, name } });
      const token = result?.tokens?.token || result?.token;
      if (!token) throw new Error('Convex Auth did not return a bearer token.');
      client.setAuth(token);
      await client.mutation(api.account.ensureAccount, { name });
      return { client, token, auth: { mode: flow, email } };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
