/** Explicit trusted-admin integration harness. This exercises real online
 * handlers under a selected test identity; it does NOT prove browser login. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getFunctionName } from 'convex/server';
const exec = promisify(execFile);
export async function createAuthenticatedClient() {
  if (process.env.NEXT_PUBLIC_CONVEX_URL !== 'https://knowing-snail-785.convex.cloud') throw new Error('Use the authorized online FinalFrame deployment.');
  const identity = JSON.parse(process.env.FINALFRAME_FIXTURE_CLI_IDENTITY ?? 'null');
  if (!identity?.subject || !identity?.issuer) throw new Error('Explicit test identity required.');
  async function call(ref, args) {
    const name = getFunctionName(ref);
    try {
      const { stdout } = await exec('pnpm', ['exec', 'convex', 'run', name, JSON.stringify(args ?? {}), '--identity', JSON.stringify(identity), '--deployment', 'knowing-snail-785', '--typecheck', 'disable', '--codegen', 'disable'], { maxBuffer: 2 * 1024 * 1024 });
      return stdout.trim() ? JSON.parse(stdout) : null;
    } catch (error) {
      // Do not dump CLI arguments or media URLs into failed test reports.
      throw new Error(`Online fixture call failed: ${name}`, { cause: error.code });
    }
  }
  return { client: { query: call, mutation: call, action: call } };
}
