// Shared pure format code: safe for the Convex runtime and browser tooling.
export const INDEX_PAYLOAD_BYTES = 120 * 1024;
const FRAGMENT_BYTES = 24 * 1024;
export type ExportRecord = { kind: string; id: string; value: Record<string, unknown> };
export type FragmentProgress = { itemOffset: number; fragmentOffset: number; fragmentId?: string; fragmentHash?: string };
const encoder = new TextEncoder();
export async function sha256(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer))).map((value) => value.toString(16).padStart(2, '0')).join('');
}
export async function exportPayload(records: Array<ExportRecord | null>, progress: FragmentProgress) {
  let itemOffset = progress.itemOffset;
  let fragmentOffset = progress.fragmentOffset;
  let fragmentId = progress.fragmentId;
  let fragmentHash = progress.fragmentHash;
  let body = ''; let byteCount = 0; let recordCount = 0;
  if (!Number.isSafeInteger(itemOffset) || itemOffset < 0 || itemOffset > records.length || !Number.isSafeInteger(fragmentOffset) || fragmentOffset < 0) throw new Error('Invalid account-index continuation.');
  if (fragmentOffset && itemOffset === records.length) throw new Error('Account-index record access changed. Start a new index request.');
  while (itemOffset < records.length) {
    const record = records[itemOffset];
    if (!record) {
      if (fragmentOffset) throw new Error('Account-index record access changed. Start a new index request.');
      itemOffset++; continue;
    }
    const plain = JSON.stringify(record.value);
    const bytes = encoder.encode(plain);
    const line = JSON.stringify({ type: 'record', section: record.kind, record: record.value }) + '\n';
    const size = encoder.encode(line).byteLength;
    if (!fragmentOffset && size <= INDEX_PAYLOAD_BYTES) {
      if (byteCount + size > INDEX_PAYLOAD_BYTES) break;
      body += line; byteCount += size; itemOffset++; recordCount++; continue;
    }
    if (byteCount) break;
    const hash = await sha256(bytes);
    if (fragmentOffset && (fragmentId !== record.id || fragmentHash !== hash || fragmentOffset >= bytes.length)) throw new Error('Account-index record content changed. Start a new index request.');
    const end = Math.min(fragmentOffset + FRAGMENT_BYTES, bytes.length);
    const data = btoa(String.fromCharCode(...bytes.slice(fragmentOffset, end)));
    body = JSON.stringify({ type: 'record_fragment', section: record.kind, recordId: record.id, encoding: 'base64-utf8-json', sha256: hash, offset: fragmentOffset, totalBytes: bytes.length, data }) + '\n';
    byteCount = encoder.encode(body).byteLength;
    fragmentOffset = end;
    if (end === bytes.length) { itemOffset++; fragmentOffset = 0; fragmentId = undefined; fragmentHash = undefined; recordCount++; }
    else { fragmentId = record.id; fragmentHash = hash; }
    break;
  }
  if (byteCount > INDEX_PAYLOAD_BYTES) throw new Error('Account-index part exceeds its explicit byte bound.');
  return { body, byteCount, recordCount, progress: { itemOffset, fragmentOffset, ...(fragmentId ? { fragmentId, fragmentHash } : {}) }, consumed: itemOffset === records.length };
}
