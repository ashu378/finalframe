'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Loader2 } from 'lucide-react';
import { uploadAsset } from '@/lib/assets/actions';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface UploadProgress {
    name: string;
    status: 'uploading' | 'success' | 'error';
    progress: number;
}

export function UploadButton({ studioId }: { studioId: string }) {
    const [uploads, setUploads] = useState<UploadProgress[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const handleUpload = async (files: FileList | File[]) => {
        const fileArray = Array.from(files);
        const newUploads = fileArray.map(f => ({ name: f.name, status: 'uploading' as const, progress: 0 }));
        setUploads(prev => [...prev, ...newUploads]);

        for (const file of fileArray) {
            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await uploadAsset(studioId, formData);
                if (res.success) {
                    setUploads(prev => prev.map(u => u.name === file.name ? { ...u, status: 'success' as const, progress: 100 } : u));
                } else {
                    setUploads(prev => prev.map(u => u.name === file.name ? { ...u, status: 'error' as const } : u));
                }
            } catch (err) {
                setUploads(prev => prev.map(u => u.name === file.name ? { ...u, status: 'error' as const } : u));
            }
        }

        router.refresh();
        // Clear success/error after 3s
        setTimeout(() => {
            setUploads([]);
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
                className="px-10 h-14 rounded-sm font-black text-metadata uppercase tracking-[0.2em] shadow-2xl shadow-primary/20 transition-all active:scale-95 flex items-center gap-3"
            >
                {isUploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                    <Upload className="w-5 h-5" />
                )}
                <span>{isUploading ? 'UPLOADING...' : 'UPLOAD_MATERIAL'}</span>
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
                    <div className="bg-zinc-900 p-20 rounded-sm border border-primary/30 shadow-3xl text-center pointer-events-none">
                        <div className="w-24 h-24 rounded-sm bg-primary/10 flex items-center justify-center mx-auto mb-10 border border-primary/20 shadow-2xl">
                            <Upload className="w-12 h-12 text-primary animate-bounce" />
                        </div>
                        <h2 className="text-3xl font-black text-zinc-50 mb-6 uppercase tracking-[0.2em] italic">DEPOSIT_MANIFEST</h2>
                        <p className="text-metadata font-black text-zinc-500 uppercase tracking-widest leading-loose">RELEASE_FILES_TO_AUTHORIZE_STAGING_Registry</p>
                    </div>
                </div>
            )}

            {/* Progress Toast-style UI (Bottom Right) */}
            {uploads.length > 0 && (
                <div className="fixed bottom-10 right-10 z-[70] w-96 space-y-4 animate-in slide-in-from-right-10 fade-in duration-300">
                    {uploads.map((upload, i) => (
                        <div key={i} className="p-6 bg-zinc-900 border border-zinc-800 rounded-sm shadow-3xl flex items-center gap-6 relative overflow-hidden group">
                            <div className="flex-1 min-w-0 z-10">
                                <p className="text-metadata font-black text-zinc-50 truncate uppercase tracking-widest italic">{upload.name}</p>
                                <div className="h-1 bg-zinc-950 rounded-none mt-4 overflow-hidden shadow-inner">
                                    <div
                                        className={cn(
                                            "h-full transition-all duration-700",
                                            upload.status === 'success' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' :
                                                upload.status === 'error' ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-primary shadow-[0_0_15px_rgba(251,191,36,0.4)]'
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

