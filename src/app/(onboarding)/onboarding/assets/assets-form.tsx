'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileUpload } from '@/components/onboarding/file-upload';
import { saveAssets } from '@/lib/onboarding/actions';

export function AssetsForm() {
    const [logo, setLogo] = useState<{ path: string, name: string } | null>(null);
    const [visuals, setVisuals] = useState<{ path: string, name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        setError(null);

        if (!logo) {
            setError('Please upload a logo');
            setLoading(false);
            return;
        }
        if (visuals.length < 1) {
            setError('Please upload at least one product visual');
            setLoading(false);
            return;
        }

        formData.set('logo_path', logo.path);
        formData.set('logo_name', logo.name);
        formData.set('visuals', JSON.stringify(visuals));

        try {
            const result = await saveAssets(formData);
            if (result?.error) {
                setError(result.error);
                setLoading(false);
            }
        } catch (e) {
            // Redirect handled by Next.js
        }
    }

    return (
        <form action={handleSubmit} className="space-y-8">
            {/* Section 1: Logo */}
            <div className="space-y-6 border border-white/5 p-8 rounded-sm bg-black/40 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/20" />
                <div className="flex justify-between items-start">
                    <h2 className="text-[14px] font-black text-white uppercase tracking-[0.3em] italic">01. Master_Mark (Logo)</h2>
                    <span className="text-[9px] font-black text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-sm uppercase tracking-widest italic">Required</span>
                </div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-loose">High-resolution vector data (SVG/PNG) for manifest branding.</p>

                {!logo ? (
                    <FileUpload
                        onUploadComplete={(path, name) => setLogo({ path, name })}
                        accept="image/*"
                    />
                ) : (
                    <div className="flex items-center justify-between bg-black border border-primary/30 p-4 rounded-sm shadow-2xl">
                        <span className="text-[11px] font-black text-primary uppercase tracking-widest italic">{logo.name}</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLogo(null)}
                            type="button"
                            className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:text-red-400 hover:bg-red-500/5 px-4 h-9 rounded-sm transition-all italic"
                        >
                            Purge_Data
                        </Button>
                    </div>
                )}
            </div>

            {/* Section 2: Visuals */}
            <div className="space-y-6 border border-white/5 p-8 rounded-sm bg-black/40 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/20" />
                <div className="flex justify-between items-start">
                    <h2 className="text-[14px] font-black text-white uppercase tracking-[0.3em] italic">02. Static_Manifest (Visuals)</h2>
                    <span className="text-[9px] font-black text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-sm uppercase tracking-widest italic">Min_1_Required</span>
                </div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-loose">Authorize production material for AI signal reference.</p>

                <div className="space-y-2">
                    {visuals.map((v, i) => (
                        <div key={i} className="flex items-center justify-between bg-black border border-white/5 p-4 rounded-sm">
                            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest italic">{v.name}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setVisuals(prev => prev.filter((_, idx) => idx !== i))}
                                type="button"
                                className="text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-widest px-4 h-9 rounded-sm transition-all italic"
                            >
                                Purge
                            </Button>
                        </div>
                    ))}
                </div>

                <div className="mt-2">
                    <FileUpload
                        label="Add Visual"
                        onUploadComplete={(path, name) => setVisuals(prev => [...prev, { path, name }])}
                        accept="image/*,video/*"
                    />
                </div>
            </div>

            {error && (
                <div className="text-red-500 text-[10px] font-black bg-red-500/5 border border-red-500/20 p-5 rounded-sm flex items-center gap-3 uppercase tracking-widest italic">
                    <span className="w-1.5 h-1.5 rounded-none bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                    {error}
                </div>
            )}

            <Button
                type="submit"
                disabled={loading || !logo || visuals.length < 1}
                size="lg"
                className="w-full h-16 text-[11px] font-black uppercase tracking-[0.3em] bg-primary text-black rounded-sm shadow-2xl shadow-primary/20 hover:bg-white active:scale-[0.98] transition-all border-none italic"
            >
                {loading ? 'ARCHIVING_MANIFEST...' : 'Authorize_Material'}
            </Button>
        </form>
    );
}
