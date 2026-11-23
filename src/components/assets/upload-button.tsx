'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Loader2 } from 'lucide-react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { uploadLibraryFile } from '@/lib/assets/upload-library-file';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface UploadProgress {
    id: string;
    name: string;
    status: 'uploading' | 'success' | 'error';
    progress: number;
}

export function UploadButton({ studioId, projectExternalId }: { studioId: string; projectExternalId?: string }) {
    const [uploads, setUploads] = useState<UploadProgress[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const begin = useMutation(api.assetStorage.beginLibraryUpload);
    const finish = useMutation(api.assetStorage.finishLibraryUpload);

    const handleUpload = async (files: FileList | File[]) => {
        const fileArray = Array.from(files);
        const newUploads = fileArray.map(f => ({ id: crypto.randomUUID(), name: f.name, status: 'uploading' as const, progress: 0 }));
        setUploads(prev => [...prev.filter(u => u.status !== 'error' || !newUploads.some(item => item.name === u.name)), ...newUploads]);

        for (const [index, file] of fileArray.entries()) {
            const { id } = newUploads[index];
            try {
                await uploadLibraryFile(file, { studioExternalId: studioId, projectExternalId }, begin, finish);
                setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'success', progress: 100 } : u));
            } catch {
                setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'error' } : u));
            }
        }
        if (inputRef.current) inputRef.current.value = '';

        router.refresh();
        // Keep failures visible so a creator can retry.
        setTimeout(() => {
            setUploads(prev => prev.filter(upload => upload.status !== 'success' || !newUploads.some(item => item.id === upload.id)));
        }, 3000);
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
        else if (e.type === "dragleave") setDragActive(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleUpload(e.dataTransfer.files);
        }
    };

    const isUploading = uploads.some(u => u.status === 'uploading');

    return (
        <div className="relative" onDragEnter={handleDrag}>
            <input
                type="file"
                ref={inputRef}
                className="hidden"
                multiple
                accept="image/*,video/*,audio/*"
                onChange={(e) => e.target.files && handleUpload(e.target.files)}
                disabled={isUploading}
            />

            <Button
                variant="primary"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
                className="min-h-12 rounded-xl px-6 text-sm font-semibold flex items-center gap-3"
            >
                {isUploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                    <Upload className="w-5 h-5" />
                )}
                <span>{isUploading ? 'Uploading…' : 'Upload files'}</span>
            </Button>

            {/* Global Drop Zone Overlay */}
            {dragActive && (
                <div
                    className="fixed inset-0 z-[100] bg-zinc-950/80 backdrop-blur-md border-[8px] border-dashed border-primary flex items-center justify-center animate-in fade-in zoom-in duration-300"
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                >
                    <div className="bg-card p-6 sm:p-10 rounded-xl border border-primary/30 shadow-3xl text-center pointer-events-none">
                        <div className="w-24 h-24 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-10 border border-primary/20 shadow-2xl">
                            <Upload className="w-12 h-12 text-primary animate-bounce" />
                        </div>
                        <h2 className="text-3xl font-semibold text-zinc-50 mb-6 tracking-normal ">Drop your files here</h2>
                        <p className="text-sm font-semibold text-muted-foreground tracking-normal leading-loose">Release to upload them to your library.</p>
                    </div>
                </div>
            )}

            {/* Progress Toast-style UI (Bottom Right) */}
            {uploads.length > 0 && (
                <div className="fixed bottom-4 left-4 right-4 z-[70] sm:left-auto sm:w-96 space-y-4 animate-in slide-in-from-right-10 fade-in duration-300">
                    {uploads.map(upload => (
                        <div key={upload.id} role="status" aria-live="polite" className="p-6 bg-card border border-border rounded-xl shadow-3xl flex items-center gap-6 relative overflow-hidden group">
                            <div className="flex-1 min-w-0 z-10">
                                <p className="text-sm font-semibold text-zinc-50 truncate tracking-normal ">{upload.name}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{upload.status === 'uploading' ? 'Uploading…' : upload.status === 'success' ? 'File added' : 'Upload failed. Choose the file again to retry.'}</p>
                                <div className="h-1 bg-zinc-950 rounded-none mt-4 overflow-hidden shadow-inner">
                                    <div
                                        className={cn(
                                            "h-full transition-all duration-700",
                                            upload.status === 'success' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' :
                                                upload.status === 'error' ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-primary'
                                        )}
                                        style={{ width: `${upload.status === 'uploading' ? 50 : 100}%` }}
                                    />
                                </div>
                            </div>
                            {upload.status === 'uploading' && <Loader2 className="w-5 h-5 text-primary animate-spin z-10" />}
                            {upload.status === 'success' && <div className="w-3 h-3 bg-emerald-500 z-10 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />}
                            {upload.status === 'error' && <div className="w-3 h-3 bg-red-500 z-10 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

