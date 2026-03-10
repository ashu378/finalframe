'use client';

import { type Template } from '@/lib/types/database';
import { createProjectFromTemplate } from '@/lib/templates/actions';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, LayoutTemplate } from 'lucide-react';
import { useState } from 'react';

interface TemplateListProps {
    templates: Template[];
    studioId: string;
}

export function TemplateList({ templates, studioId }: TemplateListProps) {
    const router = useRouter();
    const [creatingId, setCreatingId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 9;

    const totalPages = Math.ceil(templates.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedTemplates = templates.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const handleUseTemplate = async (template: Template) => {
        setCreatingId(template.id);
        try {
            const res = await createProjectFromTemplate(studioId, template.id, `${template.name} Project`);
            if (res.success && res.projectId) {
                router.push(`/dashboard/projects/${res.projectId}`);
            } else {
                alert('Failed to create project: ' + res.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error creating project');
        } finally {
            setCreatingId(null);
        }
    };

    if (templates.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] border border-white/5 bg-black/20 rounded-sm text-zinc-600">
                <div className="w-20 h-20 rounded-sm bg-black/40 flex items-center justify-center mb-6 border border-white/5 shadow-2xl relative">
                    <div className="absolute inset-0 border border-primary/20 animate-pulse rounded-sm" />
                    <LayoutTemplate className="w-8 h-8 text-zinc-800" />
                </div>
                <h3 className="text-white font-black uppercase tracking-[0.3em] mb-2 italic">No Blueprints Detected</h3>
                <p className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest italic text-center max-w-[280px] leading-loose">Awaiting official studio presets from central command.</p>
            </div>
        );
    }

    return (
        <div className="space-y-12 pb-20">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                {paginatedTemplates.map(template => (
                    <div key={template.id} className="group relative bg-black/40 border border-white/5 rounded-sm overflow-hidden hover:border-primary/50 transition-all duration-500 shadow-2xl flex flex-col">
                        {/* Thumbnail */}
                        <div className="aspect-video bg-zinc-950 relative flex items-center justify-center overflow-hidden">
                            {template.thumbnail_url ? (
                                <img src={template.thumbnail_url} alt={template.name} className="w-full h-full object-cover relative z-10 transition-transform duration-1000 group-hover:scale-105" />
                            ) : (
                                <div className="w-full h-full bg-black/60 flex items-center justify-center group-hover:scale-105 transition-transform duration-1000">
                                    <LayoutTemplate className="w-16 h-16 text-zinc-900" />
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(251,191,36,0.05)_0%,_transparent_70%)]" />
                                </div>
                            )}

                            {template.is_public && (
                                <div className="absolute top-5 left-5 z-20 bg-primary text-black text-[9px] font-black px-4 py-1.5 rounded-sm uppercase tracking-[0.2em] shadow-2xl italic border border-black/20 transition-transform group-hover:scale-110">
                                    MISSION_CRITICAL_PRESET
                                </div>
                            )}

                            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-15" />
                        </div>

                        <div className="p-8 flex-1 flex flex-col relative">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-[18px] font-black text-white tracking-[0.05em] group-hover:text-primary transition-colors uppercase italic mb-3">{template.name}</h3>
                                    <p className="text-zinc-600 text-[11px] font-bold mt-2 line-clamp-2 leading-loose uppercase tracking-widest">{template.description}</p>
                                </div>
                            </div>

                            <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[9px] text-zinc-700 uppercase font-black tracking-[0.25em] italic">{template.category.replace('_', ' ')}</span>
                                </div>

                                <Button
                                    size="sm"
                                    variant="primary"
                                    className="gap-3 px-6 h-11 rounded-sm font-black text-[10px] shadow-2xl shadow-primary/20 active:scale-95 transition-all uppercase tracking-widest"
                                    onClick={() => handleUseTemplate(template)}
                                    disabled={!!creatingId}
                                >
                                    {creatingId === template.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Plus className="w-4 h-4" />
                                    )}
                                    <span>Inject Blueprint</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-12 border-t border-white/5">
                    <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em] italic">
                        Viewing <span className="text-zinc-400">{startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, templates.length)}</span> of <span className="text-zinc-400">{templates.length}</span> Official Presets
                    </p>
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
                        >
                            PREV_VEC
                        </Button>
                        <div className="flex items-center gap-2">
                            {Array.from({ length: totalPages }).map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setCurrentPage(i + 1)}
                                    className={`w-2 h-2 rounded-none rotate-45 border transition-all duration-500 ${currentPage === i + 1
                                            ? 'bg-primary border-primary shadow-[0_0_10px_rgba(251,191,36,0.5)]'
                                            : 'bg-transparent border-zinc-800 hover:border-zinc-400'
                                        }`}
                                />
                            ))}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
                        >
                            NEXT_VEC
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

