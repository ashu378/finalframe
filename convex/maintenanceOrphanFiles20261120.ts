import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
import schema from './schema';
import type { Id, TableNames } from './_generated/dataModel';

// One-off, server-only cleanup. These six tiny fixture files were unreferenced
// in both the Nov 14 and Nov 20 complete metadata inventories. Exact bodies
// were saved privately and SHA-256 verified before this operation was run.
const reviewed = [
  ['kg213rdwp809sm1b6z28rqxqcd8hm0gw', 68, 'PAze9degyQdAYXOHD4ddRACGQE5BgulWDdCBmLdsr9U='],
  ['kg29s8hrh10nhypvv2yarzkn798hkrtw', 68, '3w1m9pMTEIQHQ0qog9s+9CDqM4QlpJ6DVNY+E/b/7iY='],
  ['kg23y3e2jectnph49jwd2gxzy98ex2a1', 12373, 'JthX6FxvhqMV0wayadDCT+gjh9y64sN0ehrnsghgdEk='],
  ['kg27aj27z2st4na3xbh1zp6t0h8ewt5q', 12373, 'JthX6FxvhqMV0wayadDCT+gjh9y64sN0ehrnsghgdEk='],
  ['kg29e6p03f19yfwqthd2xkw3zs8ewkcc', 1507, '16Nabdve2GT0jXkcqjqXU9PBBOpybOv2PPZFk2rez3c='],
  ['kg20c8c0hekdpjd783pqh10j2x8evmkx', 1507, '16Nabdve2GT0jXkcqjqXU9PBBOpybOv2PPZFk2rez3c='],
] as const;

export const clean = internalMutation({
  args: { execute: v.boolean(), backupReceipt: v.optional(v.string()) },
  returns: v.object({ deleted: v.number(), bytes: v.number(), candidates: v.number(), documentsScanned: v.number(), tables: v.array(v.string()) }),
  handler: async (ctx, args) => {
    if (process.env.CONVEX_SITE_URL !== 'https://knowing-snail-785.convex.site') throw new Error('This maintenance operation belongs only to the reviewed FinalFrame deployment.');
    if (args.execute && args.backupReceipt !== 'storage-20261120:sha256-verified-six-fixtures') throw new Error('Verified local file backup receipt required.');
    const candidates: Array<{ id: Id<'_storage'>; size: number }> = [];
    for (const [rawId, size, sha256] of reviewed) {
      const id = rawId as Id<'_storage'>;
      const file = await ctx.db.system.get('_storage', id);
      if (!file) continue;
      if (file.size !== size || file.sha256 !== sha256 || file._creationTime > Date.now() - 14 * 86400000) throw new Error('Reviewed file identity or age changed.');
      candidates.push({ id, size });
    }
    const tables = Object.keys(schema.tables);
    if (!candidates.length) return { deleted: 0, bytes: 0, candidates: 0, documentsScanned: 0, tables };
    let documentsScanned = 0, scannedBytes = 0;
    const inspect = (rows: unknown[]) => {
      documentsScanned += rows.length;
      if (documentsScanned > 14000) throw new Error('Inventory exceeds bounded maintenance scan; nothing was deleted.');
      for (const row of rows) {
        const text = JSON.stringify(row);
        scannedBytes += text.length;
        if (scannedBytes > 12_000_000) throw new Error('Inventory exceeds byte bound; nothing was deleted.');
        if (candidates.some(file => text.includes(file.id))) throw new Error('A reviewed file now has a retained reference; nothing was deleted.');
      }
    };
    // Administrative, one-time bounded full scan: arbitrary JSON fields can
    // hold immutable manifest/job references, so asset-index checks alone are
    // insufficient. All reads and deletes share one serializable transaction.
    for (const table of tables) inspect(await ctx.db.query(table as TableNames).take(14001 - documentsScanned));
    inspect(await ctx.db.system.query('_scheduled_functions').take(14001 - documentsScanned));
    const bytes = candidates.reduce((sum, file) => sum + file.size, 0);
    if (args.execute) {
      for (const file of candidates) await ctx.storage.delete(file.id);
      await ctx.db.insert('audit', { actorExternalId: 'internal:owner-authorized-storage-cleanup', action: 'UNREFERENCED_TEST_FILES_REMOVED', entityType: 'maintenance', entityId: 'storage-20261120', metadata: { files: candidates, bytes, backupReceipt: args.backupReceipt, documentsScanned }, createdAt: Date.now() });
    }
    return { deleted: args.execute ? candidates.length : 0, bytes, candidates: candidates.length, documentsScanned, tables };
  },
});
