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
                    <div className="grid min-h-11 min-w-11 place-items-center rounded-xl transition-colors hover:bg-secondary">
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
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
                        <DialogTitle className="flex items-center gap-3 text-zinc-50  tracking-normal ">
                            <Settings className="w-5 h-5 text-primary" />
                            Project details
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-4">
                            <label className="text-metadata text-muted-foreground ml-1">Project Name</label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter project name"
                                className="bg-background border-border h-14 rounded-xl text-sm font-bold  tracking-normal"
                            />
                        </div>
                        <div className="space-y-4">
                            <label className="text-metadata text-muted-foreground ml-1">Description (Optional)</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe the project goal..."
                                className="w-full bg-background border border-border rounded-xl p-4 text-sm font-medium text-zinc-300 focus:outline-none focus:border-primary/50 min-h-[120px] transition-all"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setIsSettingsOpen(false)} className="h-12 px-6 rounded-xl border-border text-muted-foreground font-bold  tracking-normal text-metadata transition-colors">Cancel</Button>
                        <Button
                            variant="primary"
                            onClick={handleUpdate}
                            loading={isUpdating}
                            disabled={!name.trim() || (name === project.name && (description === (project.project_description || '')))}
                            className="primary-cta h-12 px-8"
                        >
                            Save changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Archive Confirmation */}
            <Dialog open={isArchiveOpen} onOpenChange={setIsArchiveOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3 text-orange-500  tracking-normal ">
                            <Archive className="w-5 h-5" />
                            Archive this project?
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground text-sm mt-4 leading-relaxed normal-case">
                            This project will be hidden from your active studio list. All metadata, scenes, and render history for <strong className="text-zinc-300">"{project.name}"</strong> will be preserved in the archive.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-8 gap-4">
                        <Button variant="secondary" onClick={() => setIsArchiveOpen(false)} className="h-12 px-6 rounded-xl border-border text-muted-foreground font-bold  tracking-normal text-metadata transition-colors">Cancel</Button>
                        <Button
                            variant="primary"
                            className="h-12 px-8 rounded-xl bg-orange-600 text-white hover:bg-orange-500 border-none font-bold  tracking-normal text-metadata transition-colors shadow-2xl shadow-orange-600/20"
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
