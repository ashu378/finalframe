'use client';

import { useState } from 'react';

type Props = { assetId: string; url: string; name: string; mimeType: string };

export function LibraryVideoPreview({ assetId, url, name, mimeType }: Props) {
    const [open, setOpen] = useState(false);
    const canDownload = ['video/mp4', 'video/webm', 'video/quicktime'].includes(mimeType);
    return <div className="space-y-1 border-t border-border p-3" onClick={event => event.stopPropagation()}>
        <details onToggle={event => setOpen(event.currentTarget.open)}>
            <summary aria-label={`Preview video ${name}`} className="min-h-11 cursor-pointer rounded-xl px-2 py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Preview video</summary>
            {open && <video controls playsInline preload="metadata" src={url} aria-label={`Saved video ${name}`} className="mt-2 aspect-video w-full rounded-xl bg-black object-contain" />}
        </details>
        {canDownload
            ? <a href={`/api/download/asset/${encodeURIComponent(assetId)}`} download className="ff-link inline-flex min-h-11 items-center px-2" aria-label={`Download video ${name}`}>Download video</a>
            : <a href={url} target="_blank" rel="noreferrer" className="ff-link inline-flex min-h-11 items-center px-2">Open original video</a>}
    </div>;
}
