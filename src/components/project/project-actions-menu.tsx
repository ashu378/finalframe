'use client';

import * as React from 'react';
import { MoreVertical, Settings, Archive, AlertCircle } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateProject, archiveProject } from '@/lib/project/actions';
import { FullProject } from '@/lib/types/database';

interface ProjectActionsMenuProps {
    project: FullProject;
}

export function ProjectActionsMenu({ project }: ProjectActionsMenuProps) {
    const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
    const [isArchiveOpen, setIsArchiveOpen] = React.useState(false);
    const [isUpdating, setIsUpdating] = React.useState(false);
    const [isArchiving, setIsArchiving] = React.useState(false);

    // Form state
    const [name, setName] = React.useState(project.name);
    const [description, setDescription] = React.useState(project.project_description || '');

    const handleUpdate = async () => {
        setIsUpdating(true);
        const res = await updateProject(project.id, {
            name,
            description: description || undefined
        });
        setIsUpdating(false);
        if (res.success) {
            setIsSettingsOpen(false);
        } else {
            alert(res.error || 'Failed to update project');
        }
    };

    const handleArchive = async () => {
        setIsArchiving(true);
        const res = await archiveProject(project.id);
        setIsArchiving(false);
        if (res.success) {
            setIsArchiveOpen(false);
        } else {
            alert(res.error || 'Failed to archive project');
        }
    };

    return (
        <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
                <DropdownMenuTrigger>
                    <div className="p-1 hover:bg-white/10 rounded-full transition-colors">
                        <MoreVertical className="w-4 h-4 text-zinc-400" />
                    </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
                        <Settings className="w-4 h-4 mr-2" />
                        Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => setIsArchiveOpen(true)}
                        className="text-orange-400 hover:bg-orange-500/10 hover:text-orange-400"
                    >
                        <Archive className="w-4 h-4 mr-2" />
                        Archive
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Settings Dialog */}
            <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3 text-zinc-50 uppercase tracking-widest italic">
                            <Settings className="w-5 h-5 text-primary" />
                            Project Specification
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-4">
                            <label className="text-metadata text-zinc-500 ml-1">Project Name</label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter project name"
                                className="bg-zinc-950 border-zinc-800 h-14 rounded-sm text-sm font-bold uppercase tracking-widest"
                            />
                        </div>
                        <div className="space-y-4">
                            <label className="text-metadata text-zinc-500 ml-1">Description (Optional)</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe the project goal..."
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-sm p-4 text-sm font-medium text-zinc-300 focus:outline-none focus:border-primary/50 min-h-[120px] transition-all"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setIsSettingsOpen(false)} className="h-12 px-6 rounded-sm border-zinc-800 text-zinc-400 font-bold uppercase tracking-widest text-metadata transition-colors">Cancel</Button>
                        <Button
                            variant="primary"
                            onClick={handleUpdate}
                            loading={isUpdating}
                            disabled={!name.trim() || (name === project.name && (description === (project.project_description || '')))}
                            className="primary-cta h-12 px-8"
                        >
                            Save Specification
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Archive Confirmation */}
            <Dialog open={isArchiveOpen} onOpenChange={setIsArchiveOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3 text-orange-500 uppercase tracking-widest italic">
                            <Archive className="w-5 h-5" />
                            Archive Project Registry?
                        </DialogTitle>
                        <DialogDescription className="text-zinc-500 text-sm mt-4 leading-relaxed normal-case">
                            This project will be hidden from your active studio list. All metadata, scenes, and render history for <strong className="text-zinc-300">"{project.name}"</strong> will be preserved in the archive.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-8 gap-4">
                        <Button variant="secondary" onClick={() => setIsArchiveOpen(false)} className="h-12 px-6 rounded-sm border-zinc-800 text-zinc-400 font-bold uppercase tracking-widest text-metadata transition-colors">Cancel</Button>
                        <Button
                            variant="primary"
                            className="h-12 px-8 rounded-sm bg-orange-600 text-white hover:bg-orange-500 border-none font-bold uppercase tracking-widest text-metadata transition-colors shadow-2xl shadow-orange-600/20"
                            onClick={handleArchive}
                            loading={isArchiving}
                        >
                            Confirm Archive
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
