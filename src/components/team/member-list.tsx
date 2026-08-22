'use client';

import { useState, useTransition } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, Shield, UserX, Loader2 } from 'lucide-react';
import type { StudioMember, StudioRole } from '@/lib/types/database';
import { updateMemberRole, removeMember } from '@/lib/teams/actions';
import { useRouter } from 'next/navigation';

interface MemberListProps {
    members: StudioMember[];
    currentUserId: string;
}

export function MemberList({ members, currentUserId }: MemberListProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const currentUserMember = members.find(m => m.user_id === currentUserId);
    const isOwner = currentUserMember?.role === 'owner';

    const handleRoleChange = (member: StudioMember, newRole: StudioRole) => {
        startTransition(async () => {
            await updateMemberRole(member.id, newRole, member.status === 'pending');
            router.refresh();
        });
    };

    const handleRemoveMember = (member: StudioMember) => {
        const confirmMsg = member.status === 'pending'
            ? 'Are you sure you want to cancel this invitation?'
            : 'Are you sure you want to remove this member?';

        if (!confirm(confirmMsg)) return;
        startTransition(async () => {
            await removeMember(member.id, member.status === 'pending');
            router.refresh();
        });
    };

    const getInitials = (name?: string, email?: string) => {
        if (name && name !== 'Invited User') {
            const parts = name.split(' ');
            if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
            return name.slice(0, 2).toUpperCase();
        }
        if (email) return email.slice(0, 2).toUpperCase();
        return '??';
    };

    const roleColors: Record<StudioRole, string> = {
        owner: 'bg-primary/10 text-primary border-primary/20',
        editor: 'bg-zinc-100/10 text-zinc-100 border-zinc-100/20',
        reviewer: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        viewer: 'bg-zinc-700/10 text-zinc-600 border-zinc-700/20',
    };

    return (
        <div className="rounded-sm border border-white/5 bg-black/40 backdrop-blur-md shadow-2xl relative overflow-visible">
            <Table className="relative overflow-visible">
                <TableHeader className="bg-zinc-950 border-b border-zinc-800">
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-metadata font-black uppercase tracking-[0.3em] text-zinc-500 italic">Person</TableHead>
                        <TableHead className="text-metadata font-black uppercase tracking-[0.3em] text-zinc-500 italic">Role</TableHead>
                        <TableHead className="text-metadata font-black uppercase tracking-[0.3em] text-zinc-500 italic">Status</TableHead>
                        <TableHead className="text-metadata font-black uppercase tracking-[0.3em] text-zinc-500 italic">Added</TableHead>
                        <TableHead className="text-right text-metadata font-black uppercase tracking-[0.3em] text-zinc-500 italic">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {members.map((member) => (
                        <TableRow key={member.id} className="border-white/5 hover:bg-white/5">
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-10 w-10 border border-white/10 rounded-sm">
                                        <AvatarImage src={member.avatar_url} />
                                        <AvatarFallback className="bg-zinc-800/50 text-primary/70 font-black text-[10px] rounded-sm border border-white/5">
                                            {getInitials(member.full_name, member.email)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="text-sm font-black text-zinc-50 uppercase tracking-widest flex items-center gap-4 italic">
                                            {member.full_name?.toUpperCase()}
                                            {member.user_id === currentUserId && (
                                                <Badge variant="secondary" className="text-metadata font-black py-1 px-3 bg-primary !text-black border-transparent rounded-sm italic shadow-2xl shadow-primary/20">
                                                    You
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="text-metadata font-bold text-zinc-500 uppercase tracking-widest mt-2 italic">{member.email}</div>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline" className={`${roleColors[member.role]} uppercase text-metadata font-black tracking-[0.2em] rounded-sm px-4 py-1.5 italic shadow-inner`}>
                                    {member.role === 'owner' && <Shield className="w-3.5 h-3.5 mr-2" />}
                                    {member.role?.toUpperCase()}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                {member.status === 'pending' ? (
                                    <Badge className="bg-zinc-950 text-zinc-500 border border-zinc-800 text-metadata uppercase font-black tracking-[0.3em] rounded-sm px-3 py-1 animate-pulse italic">Invitation pending</Badge>
                                ) : (
                                    <Badge className="bg-emerald-500/5 text-emerald-500 border border-emerald-500/20 text-metadata uppercase font-black tracking-[0.3em] rounded-sm px-3 py-1 italic shadow-2xl shadow-emerald-500/10">Active</Badge>
                                )}
                            </TableCell>
                            <TableCell className="text-zinc-500 text-metadata font-black uppercase tracking-widest italic leading-relaxed">
                                {new Date(member.created_at).toLocaleDateString().replace(/\//g, '.')}
                            </TableCell>
                            <TableCell className="text-right">
                                {isOwner && member.user_id !== currentUserId && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-9 w-9 p-0 hover:bg-white/5 rounded-sm border border-transparent hover:border-white/5">
                                                <span className="sr-only">Open menu</span>
                                                <MoreHorizontal className="h-4 w-4 text-zinc-400 hover:text-white" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-zinc-950 border border-white/5 text-zinc-300 min-w-[200px] p-3 rounded-sm shadow-2xl backdrop-blur-3xl">
                                            <DropdownMenuLabel className="text-zinc-400 text-[9px] uppercase font-black tracking-[0.3em] px-2 py-3">Authorization_Override</DropdownMenuLabel>
                                            <DropdownMenuSeparator className="bg-white/10 mx-2 mb-2" />
                                            <DropdownMenuItem onClick={() => handleRoleChange(member, 'viewer')} className="rounded-sm focus:bg-white/5 py-2.5 px-3 text-[10px] font-bold uppercase tracking-widest">
                                                STRATIFY: Viewer
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleRoleChange(member, 'reviewer')} className="rounded-sm focus:bg-white/5 py-2.5 px-3 text-[10px] font-bold uppercase tracking-widest">
                                                STRATIFY: Reviewer
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleRoleChange(member, 'editor')} className="rounded-sm focus:bg-white/5 py-2.5 px-3 text-[10px] font-bold uppercase tracking-widest">
                                                STRATIFY: Editor
                                            </DropdownMenuItem>
                                            {member.status === 'active' && (
                                                <DropdownMenuItem onClick={() => handleRoleChange(member, 'owner')} className="rounded-sm focus:bg-white/5 py-2.5 px-3 text-[10px] font-black uppercase tracking-widest text-primary">
                                                    <Shield className="mr-3 h-3.5 w-3.5" />
                                                    ASSIGN_MASTER_CONTROL
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuSeparator className="bg-white/10 mx-2 my-2" />
                                            <DropdownMenuItem
                                                onClick={() => handleRemoveMember(member)}
                                                className="rounded-sm text-red-500 focus:text-red-400 focus:bg-red-500/10 py-2.5 px-3 text-[10px] font-black uppercase tracking-widest"
                                            >
                                                <UserX className="mr-3 h-3.5 w-3.5" />
                                                {member.status === 'pending' ? 'REVOKE_STAGING' : 'PURGE_PERSONNEL'}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
