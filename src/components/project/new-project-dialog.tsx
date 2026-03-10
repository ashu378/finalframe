/**
 * FinalFrame — New Project Dialog
 * Reference: MASTER_PRD.md § 5.II — Project Creation
 * Reference: BUILD_PHASES.md — Phase 2 New project creation flow
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ProjectContentType } from '@/lib/types/database';
import { createProject } from '@/lib/project/actions';
import { Info, Loader2, X } from 'lucide-react';

import { CreateProjectWizard } from '@/components/project/create-project-wizard';

interface NewProjectDialogProps {
    isOpen: boolean;
    studioId?: string;
    onClose: () => void;
}

export function NewProjectDialog({ isOpen, studioId, onClose }: NewProjectDialogProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose}>
            <div
                className="w-full max-w-[1020px] mx-4 glass-card border border-white/10 rounded-2xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <CreateProjectWizard onClose={onClose} studioId={studioId} />
            </div>
        </div>
    );
}
