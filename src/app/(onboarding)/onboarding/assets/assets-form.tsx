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

        if (logo) {
            formData.set('logo_path', logo.path);
            formData.set('logo_name', logo.name);
        }
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
            <div className="space-y-6 border border-white/5 p-8 rounded-xl bg-card  relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/20" />
                <div className="flex justify-between items-start">
                    <h2 className="text-[14px] font-semibold text-foreground">01. Your logo <span className="font-normal text-muted-foreground">(optional)</span></h2>
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">Optional</span>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">Add a logo if you want it in your first video. You can always add it later.</p>

                {!logo ? (
                    <FileUpload
                        onUploadComplete={(path, name) => setLogo({ path, name })}
                        accept="image/*"
                    />
                ) : (
                    <div className="flex items-center justify-between bg-background border border-primary/30 p-4 rounded-xl ">
                        <span className="text-sm font-semibold text-primary normal-case tracking-normal not-italic">{logo.name}</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLogo(null)}
                            type="button"
                            className="text-sm font-semibold text-red-500 normal-case tracking-normal hover:text-red-400 hover:bg-red-500/5 px-4 h-9 rounded-xl transition-all not-italic"
                        >
                            Purge_Data
                        </Button>
                    </div>
                )}
            </div>

            {/* Section 2: Visuals */}
            <div className="space-y-6 border border-white/5 p-8 rounded-xl bg-card  relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/20" />
                <div className="flex justify-between items-start">
                    <h2 className="text-[14px] font-semibold text-foreground">02. Your images and clips <span className="font-normal text-muted-foreground">(optional)</span></h2>
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">Optional</span>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">Products, characters, footage, or references can help with consistency, but you do not need them to begin.</p>

                <div className="space-y-2">
                    {visuals.map((v, i) => (
                        <div key={i} className="flex items-center justify-between bg-background border border-white/5 p-4 rounded-xl">
                            <span className="text-sm font-semibold text-muted-foreground normal-case tracking-normal not-italic">{v.name}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setVisuals(prev => prev.filter((_, idx) => idx !== i))}
                                type="button"
                                className="text-sm font-semibold text-muted-foreground hover:text-white normal-case tracking-normal px-4 h-9 rounded-xl transition-all not-italic"
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
                <div className="text-red-500 text-sm font-semibold bg-red-500/5 border border-red-500/20 p-5 rounded-xl flex items-center gap-3 normal-case tracking-normal not-italic">
                    <span className="w-1.5 h-1.5 rounded-none bg-red-500 " />
                    {error}
                </div>
            )}

            <Button
                type="submit"
                disabled={loading}
                size="lg"
                className="w-full min-h-12 text-sm font-semibold normal-case tracking-normal bg-primary text-black rounded-xl   hover:bg-white active:scale-[0.98] transition-all border-none not-italic"
            >
                {loading ? 'Saving…' : logo || visuals.length ? 'Save media and continue' : 'Skip for now'}
            </Button>
        </form>
    );
}
