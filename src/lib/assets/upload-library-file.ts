import { SHA256 } from '@oslojs/crypto/sha2';
import type { Id } from '../../../convex/_generated/dataModel';

type UploadMetadata = {
    studioExternalId: string; projectExternalId?: string;
    name: string; mimeType: string; byteSize: number; checksum: string;
};
type UploadTicket = { ticketId: Id<'libraryUploadTickets'>; uploadUrl: string };

export async function uploadLibraryFile(
    file: File,
    scope: Pick<UploadMetadata, 'studioExternalId' | 'projectExternalId'>,
    begin: (metadata: UploadMetadata) => Promise<UploadTicket>,
    finish: (receipt: { ticketId: Id<'libraryUploadTickets'>; storageId: Id<'_storage'> }) => Promise<Id<'assets'>>,
    send: typeof fetch = fetch,
) {
    if (!file.size || file.size > 500 * 1024 * 1024) throw new Error('Choose a non-empty file of up to 500 MB.');
    // Bind the receipt to the chosen bytes without buffering a large movie in memory.
    const hash = new SHA256();
    const chunkSize = 2 * 1024 * 1024;
    for (let offset = 0; offset < file.size; offset += chunkSize) {
        hash.update(new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer()));
    }
    const checksum = Array.from(hash.digest(), byte => byte.toString(16).padStart(2, '0')).join('');
    const mimeType = file.type || 'application/octet-stream';
    const { ticketId, uploadUrl } = await begin({ ...scope, name: file.name, mimeType, byteSize: file.size, checksum });
    const response = await send(uploadUrl, {
        method: 'POST', body: file, headers: { 'Content-Type': mimeType }, credentials: 'omit', redirect: 'error',
    });
    if (!response.ok) throw new Error('Storage could not receive this file. Please try again.');
    const { storageId } = await response.json();
    if (typeof storageId !== 'string' || !storageId) throw new Error('Storage did not confirm this upload.');
    return finish({ ticketId, storageId: storageId as Id<'_storage'> });
}
