'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { OptionCard } from '@/components/onboarding/option-card';
import { FileUpload } from '@/components/onboarding/file-upload';
import { saveIdentity } from '@/lib/onboarding/actions';
import { IdentityPresence } from '@/lib/onboarding/types';

const OPTIONS = [
    { id: IdentityPresence.SELF, label: 'It\'s Me (Self)', description: 'You are the face/voice.' },
    { id: IdentityPresence.AI_ACTOR, label: 'AI character', description: 'Choose a character for this setup.' },
    { id: IdentityPresence.NO_PEOPLE, label: 'No people', description: 'Use scenery, products or a voiceover.' },
];

const AI_ACTORS = [
    { id: 'actor_1', name: 'Sarah (Professional)' },
    { id: 'actor_2', name: 'James (Casual)' },
    { id: 'actor_3', name: 'Elena (Expressive)' },
];

export function IdentityForm() {
    const [selectedPresence, setSelectedPresence] = useState<string>('');
    const [actorId, setActorId] = useState<string>('');
    const [uploadedPath, setUploadedPath] = useState<string>('');
    const [uploadedName, setUploadedName] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        setError(null);

        if (!selectedPresence) {
            setError('Please select an option');
            setLoading(false);
            return;
        }

        formData.set('identity_presence', selectedPresence);

        if (selectedPresence === IdentityPresence.AI_ACTOR) {
            if (!actorId) {
                setError('Please select an AI actor');
                setLoading(false);
                return;
            }
            formData.set('actor_id', actorId);
        }

        if (selectedPresence === IdentityPresence.SELF) {
            if (!uploadedPath) {
                setError('Please upload your footage/photo');
                setLoading(false);
                return;
            }
            formData.set('identity_asset_path', uploadedPath);
            formData.set('identity_asset_name', uploadedName);
        }

        try {
            const result = await saveIdentity(formData);
            if (result?.error) {
                setError(result.error);
                setLoading(false);
            }
        } catch (e) {
            // Redirect
        }
    }

    return (
        <form action={handleSubmit} className="space-y-8">
            <div className="grid gap-3">
                {OPTIONS.map((opt) => (
                    <OptionCard
                        key={opt.id}
                        label={opt.label}
                        description={opt.description}
                        selected={selectedPresence === opt.id}
                        onClick={() => setSelectedPresence(opt.id)}
                    />
                ))}
            </div>

            {selectedPresence === IdentityPresence.SELF && (
                <div className="border border-white/5 p-8 rounded-xl bg-card  animate-in fade-in slide-in-from-top-2 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/20" />
                    <h3 className="text-sm font-semibold text-white mb-6 flex items-center gap-4 normal-case tracking-normal not-italic">
                        <span className="w-1.5 h-1.5 rounded-none bg-primary " />
                        Your photo or video
                    </h3>
                    <div className="mt-4">
                        <div className={`${!uploadedPath ? 'block' : 'hidden'}`}>
                            <FileUpload
                                bucketName="studio-assets"
                                accept="image/*,video/*"
                                onUploadComplete={(path, name) => {
                                    setUploadedPath(path);
                                    setUploadedName(name);
                                }}
                            />
                        </div>
                        {uploadedPath && (
                            <div className="flex items-center justify-between p-4 bg-background border border-primary/30 rounded-xl ">
                                <span className="text-sm font-semibold text-primary normal-case tracking-normal not-italic truncate max-w-[240px]">{uploadedName}</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { setUploadedPath(''); setUploadedName(''); }}
                                    className="text-sm font-semibold text-muted-foreground hover:text-white normal-case tracking-normal px-4 h-9 rounded-xl transition-all not-italic"
                                >
                                    Remove reference
                                </Button>
                            </div>
                        )}
                    </div>
                    <p className="text-sm font-bold text-muted-foreground normal-case tracking-normal mt-4 not-italic leading-loose">
                        Use a photo or video you have permission to use.
                    </p>
                </div>
            )}

            {selectedPresence === IdentityPresence.AI_ACTOR && (
                <div className="border border-white/5 p-8 rounded-xl bg-card  animate-in fade-in slide-in-from-top-2 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/20" />
                    <h3 className="text-sm font-semibold text-white mb-8 flex items-center gap-4 normal-case tracking-normal not-italic">
                        <span className="w-1.5 h-1.5 rounded-none bg-primary " />
                        Choose an AI character
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {AI_ACTORS.map(actor => {
                            const isSelected = actorId === actor.id;
                            return (
                                <button
                                    type="button"
                                    key={actor.id}
                                    onClick={() => setActorId(actor.id)}
                                    className={`
                                        p-5 text-left rounded-xl text-sm font-semibold normal-case tracking-normal border transition-all duration-300 not-italic
                                        outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black
                                        ${isSelected
                                            ? 'bg-primary border-primary text-black '
                                            : 'bg-background border-white/5 text-muted-foreground hover:bg-white/5 hover:text-zinc-300 hover:border-white/20'
                                        }
                                    `}
                                >
                                    {actor.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {error && (
                <div className="text-red-500 text-sm font-semibold bg-red-500/5 border border-red-500/20 p-5 rounded-xl flex items-center gap-3 normal-case tracking-normal not-italic">
                    <span className="w-1.5 h-1.5 rounded-none bg-red-500 " />
                    {error}
                </div>
            )}

            <Button
                type="submit"
                disabled={loading || !selectedPresence}
                size="lg"
                className="w-full min-h-12 text-sm font-semibold normal-case tracking-normal bg-primary text-black rounded-xl   hover:bg-white active:scale-[0.98] transition-all border-none not-italic"
            >
                {loading ? 'Saving…' : 'Continue'}
            </Button>
        </form>
    );
}
