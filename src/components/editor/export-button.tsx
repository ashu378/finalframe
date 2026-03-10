'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExportModal } from './export-modal';
import { Download } from 'lucide-react';

interface ExportButtonProps {
    projectId: string;
    snapshotId: string; // The specific version to export
    snapshotLabel?: string;
    disabled?: boolean;
}

export function ExportButton({ projectId, snapshotId, snapshotLabel, disabled }: ExportButtonProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            <Button
                variant="primary"
                size="sm"
                onClick={() => setIsModalOpen(true)}
                disabled={disabled}
                className="gap-3 h-10 px-6 text-metadata font-black uppercase tracking-widest shadow-[0_0_15px_rgba(251,191,36,0.2)]"
            >
                <Download className="w-4 h-4" />
                Export Manifest
            </Button>

            <ExportModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                projectId={projectId}
                snapshotId={snapshotId}
                snapshotLabel={snapshotLabel}
            />
        </>
    );
}
