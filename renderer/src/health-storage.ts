import { statfs } from 'node:fs/promises';

export interface FilesystemStorageObservation {
  status: 'MEASURED' | 'UNKNOWN';
  availableBytes: number | null;
  totalBytes: number | null;
}
type FilesystemBlocks = { bsize: bigint; bavail: bigint; blocks: bigint };
type ObservationOptions = {
  statfs?: (path: string) => Promise<FilesystemBlocks>;
  now?: () => number;
};
const unknown = (): FilesystemStorageObservation => ({ status: 'UNKNOWN', availableBytes: null, totalBytes: null });

/** Read available filesystem blocks for the actual configured directories.
 * This is neither a per-application quota nor reserved render capacity. Do not
 * sum the roles: output/state can share the very same backing filesystem. */
export async function observeWorkerStorage(
  paths: { outputRoot: string; stateRoot: string },
  options: ObservationOptions = {},
) {
  const read = options.statfs ?? (path => statfs(path, { bigint: true }));
  async function observe(path: string): Promise<FilesystemStorageObservation> {
    try {
      const row = await read(path);
      if (typeof row.bsize !== 'bigint' || typeof row.bavail !== 'bigint' || typeof row.blocks !== 'bigint'
        || row.bsize <= 0n || row.bavail < 0n || row.blocks <= 0n || row.bavail > row.blocks) return unknown();
      const available = row.bavail * row.bsize, total = row.blocks * row.bsize;
      // JSON numbers must remain exact; unknown is safer than rounding bytes.
      if (available > BigInt(Number.MAX_SAFE_INTEGER) || total > BigInt(Number.MAX_SAFE_INTEGER)) return unknown();
      return { status: 'MEASURED', availableBytes: Number(available), totalBytes: Number(total) };
    } catch {
      // Health must never reveal configured paths, mount names or I/O errors.
      return unknown();
    }
  }
  const [output, state] = await Promise.all([observe(paths.outputRoot), observe(paths.stateRoot)]);
  const complete = output.status === 'MEASURED' && state.status === 'MEASURED';
  return {
    version: 1 as const,
    basis: 'FILESYSTEM_AVAILABLE_BLOCKS' as const,
    quota: 'NOT_OBSERVED' as const,
    observedAt: new Date((options.now ?? Date.now)()).toISOString(),
    output,
    state,
    minimumAvailableBytes: complete ? Math.min(output.availableBytes!, state.availableBytes!) : null,
    minimumTotalBytes: complete ? Math.min(output.totalBytes!, state.totalBytes!) : null,
  };
}
