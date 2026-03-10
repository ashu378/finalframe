'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { inviteMember } from '@/lib/teams/actions';
import type { StudioRole } from '@/lib/types/database';
import { Loader2, Mail, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface InviteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    studioId: string;
}

export function InviteDialog({ open, onOpenChange, studioId }: InviteDialogProps) {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<StudioRole>('viewer');
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const handleInvite = () => {
        if (!email) return;

        startTransition(async () => {
            setError(null);
            const result = await inviteMember(studioId, email, role);
            if (result.success) {
                onOpenChange(false);
                setEmail('');
                setRole('viewer');
                router.refresh();
            } else {
                setError(result.error || 'Failed to send invite');
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px] bg-zinc-950 border border-white/10 shadow-2xl text-white overflow-hidden p-0 rounded-sm">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/30" />

                <div className="p-10 space-y-10">
                    <div className="flex flex-col items-center text-center space-y-6">
                        <div className="w-16 h-16 rounded-sm bg-black/40 flex items-center justify-center border border-white/5 shadow-2xl relative">
                            <div className="absolute inset-0 border border-primary/20 animate-pulse rounded-sm" />
                            <UserPlus className="w-6 h-6 text-primary" />
                        </div>
                        <div className="space-y-3">
                            <DialogTitle className="text-[18px] font-black uppercase tracking-[0.3em] text-white italic">
                                Personnel Authorization
                            </DialogTitle>
                            <DialogDescription className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] max-w-[340px] mx-auto leading-loose italic">
                                GROW_STUDIO_CAPACITY: AUTHORIZE_NEW_COLABORATOR_ACCESS_LEVELS
                            </DialogDescription>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-3">
                            <label className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.25em] ml-1">Personnel_Email</label>
                            <div className="relative group">
                                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-700 group-focus-within:text-primary transition-colors z-10" />
                                <Input
                                    placeholder="COLLEAGUE_ID@REGISTRY.AI"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoComplete="off"
                                    className="!pl-14 h-14 bg-black/40 border-white/5 rounded-sm text-white focus:border-primary/50 transition-all text-sm font-bold placeholder:text-zinc-800 uppercase tracking-widest"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.25em] ml-1">Authorization_Role</label>
                            <Select value={role} onValueChange={(val) => setRole(val as StudioRole)}>
                                <SelectTrigger className="h-14 bg-black/40 border-white/5 rounded-sm text-white focus:border-primary/50 transition-all text-sm font-bold uppercase tracking-widest px-6">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-950 border-white/5 rounded-sm overflow-hidden shadow-2xl">
                                    <SelectItem value="viewer" className="py-3 focus:bg-primary/10 focus:text-primary uppercase text-[9px] font-black tracking-widest">Viewer // READ_ONLY</SelectItem>
                                    <SelectItem value="reviewer" className="py-3 focus:bg-primary/10 focus:text-primary uppercase text-[9px] font-black tracking-widest">Reviewer // CAN_COMMENT</SelectItem>
                                    <SelectItem value="editor" className="py-3 focus:bg-primary/10 focus:text-primary uppercase text-[9px] font-black tracking-widest">Editor // CAN_MASTER</SelectItem>
                                    <SelectItem value="owner" className="py-3 focus:bg-primary/10 focus:text-primary uppercase text-[9px] font-black tracking-widest">Owner // FULL_CONTROL</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="p-6 rounded-sm bg-primary/5 border border-primary/20 mt-6 shadow-inner">
                                <p className="text-metadata text-primary leading-relaxed font-black uppercase tracking-[0.2em] italic">
                                    <span className="mr-3 text-primary/40">//</span>
                                    {role === 'viewer' && 'CAN_ONLY_VIEW_PROJECTS_AND_ASSETS'}
                                    {role === 'reviewer' && 'CAN_VIEW_PROJECTS_AND_LEAVE_COMMENTS'}
                                    {role === 'editor' && 'CAN_CREATE_EDIT_AND_DELETE_PROJECTS'}
                                    {role === 'owner' && 'FULL_PRIMARY_CONTROL_BILING_AND_PERSONNEL'}
                                </p>
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-in fade-in slide-in-from-top-2">
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4 pt-6 pb-2">
                        <Button
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            disabled={isPending}
                            className="flex-1 h-14 rounded-sm border border-white/5 hover:bg-white/5 text-zinc-500 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest"
                        >
                            Abort_Procedure
                        </Button>
                        <button
                            onClick={handleInvite}
                            disabled={isPending || !email}
                            className="flex-[2] bg-primary !text-black h-16 rounded-sm shadow-3xl shadow-primary/30 hover:bg-white transition-all active:scale-[0.98] font-black text-metadata uppercase tracking-[0.3em] disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed flex items-center justify-center gap-4 group italic"
                        >
                            {isPending ? (
                                <Loader2 className="h-6 w-6 animate-spin" />
                            ) : (
                                <Mail className="h-5 w-5 !text-black group-hover:scale-110 transition-transform" />
                            )}
                            <span>Commit_Authorization</span>
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
