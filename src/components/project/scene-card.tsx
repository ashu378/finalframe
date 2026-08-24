'use client';

/**
 * FinalFrame — Scene Card Component
 * Reference: MASTER_PRD.md § 5.II — Scene-by-scene storyboard
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateScene, deleteScene } from '@/lib/scene/actions';
import { uploadAsset } from '@/lib/assets/actions';
import type { Scene, CameraConfig, MotionConfig, SceneAsset, StudioAsset } from '@/lib/types/database';
import { GripVertical, Pencil, Trash2, X, Check, Loader2, Image as ImageIcon, Film, ChevronDown, AlertCircle, Plus, Upload } from 'lucide-react';
import { CameraControls } from './camera-controls';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
interface SceneCardProps {
    scene: Scene;
    index: number;
    studioAssets: StudioAsset[];
    studioId: string;
    isDragging?: boolean;
    onDragStart?: (e: React.DragEvent, sceneId: string) => void;
    onDragEnd?: () => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent, targetIndex: number) => void;
    isReadOnly?: boolean;
}

export function SceneCard({
    scene,
    index,
    studioAssets,
    studioId,
    isDragging,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop,
    isReadOnly
}: SceneCardProps) {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [goalValue, setGoalValue] = useState(scene.scene_goal);
    const [textValue, setTextValue] = useState(scene.scene_text);
    const [titleValue, setTitleValue] = useState(scene.scene_title || '');
    const [visualValue, setVisualValue] = useState(scene.visual_description || '');
    const [actionValue, setActionValue] = useState(scene.action_sequence || '');
    const [beatValue, setBeatValue] = useState(scene.emotional_beat || '');
    const [diffValue, setDiffValue] = useState(scene.differentiation_note || '');
    const [rationaleValue, setRationaleValue] = useState(scene.why_this_scene_exists || '');

    const [cameraConfig, setCameraConfig] = useState<CameraConfig>(scene.camera_config || {});
    const [motionConfig, setMotionConfig] = useState<MotionConfig>(scene.motion_config || {});
    const [sceneAssets, setSceneAssets] = useState<SceneAsset[]>(scene.scene_assets || []);

    const [error, setError] = useState<string | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [isUploading, setIsUploading] = useState(false);

    const handleSave = () => {
        startTransition(async () => {
            setError(null);
            const result = await updateScene(scene.id, {
                scene_goal: goalValue,
                scene_text: textValue,
                scene_title: titleValue,
                visual_description: visualValue,
                action_sequence: actionValue,
                emotional_beat: beatValue,
                differentiation_note: diffValue,
                why_this_scene_exists: rationaleValue,
                camera_config: cameraConfig,
                motion_config: motionConfig,
                scene_assets: sceneAssets,
            });
            if (result.success) {
                setIsEditing(false);
            } else {
                setError(result.error || 'Failed to save');
            }
        });
    };

    const handleDeleteClick = () => {
        setIsDeleteDialogOpen(true);
    };

    const handleConfirmDelete = () => {
        setIsDeleteDialogOpen(false);
        startTransition(async () => {
            const result = await deleteScene(scene.id);
            if (result.success) {
                toast.success(`Scene ${index + 1} deleted successfully`);
                router.refresh();
            } else {
                console.error('Delete failed:', result.error);
                toast.error(result.error || 'Failed to delete scene');
                setError(result.error || 'Failed to delete');
            }
        });
    };

    const handleCancel = () => {
        setGoalValue(scene.scene_goal);
        setTextValue(scene.scene_text);
        setTitleValue(scene.scene_title || '');
        setVisualValue(scene.visual_description || '');
        setActionValue(scene.action_sequence || '');
        setBeatValue(scene.emotional_beat || '');
        setDiffValue(scene.differentiation_note || '');
        setRationaleValue(scene.why_this_scene_exists || '');
        setCameraConfig(scene.camera_config || {});
        setMotionConfig(scene.motion_config || {});
        setSceneAssets(scene.scene_assets || []);
        setIsEditing(false);
        setError(null);
    };

    const addAsset = (assetId: string) => {
        if (sceneAssets.some(a => a.asset_id === assetId)) return;
        setSceneAssets([...sceneAssets, { asset_id: assetId, role: 'background' }]);
    };

    const removeAsset = (assetId: string) => {
        setSceneAssets(sceneAssets.filter(a => a.asset_id !== assetId));
    };

    const updateAssetRole = (assetId: string, role: SceneAsset['role']) => {
        setSceneAssets(sceneAssets.map(a => a.asset_id === assetId ? { ...a, role } : a));
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const result = await uploadAsset(studioId, formData);
            if (result.success && result.asset) {
                // Optimistically add to local scene assets
                // The revalidatePath will handle the long-term sync
                addAsset(result.asset.id);
                toast.success('Asset uploaded and attached');
                router.refresh();
            } else {
                console.error('Upload failed:', result.error);
                setError(result.error || 'Upload failed');
            }
        } catch (err: any) {
            console.error('Upload Exception:', err);
            setError(err?.message || 'An unexpected error occurred during upload');
        } finally {
            setIsUploading(false);
            // Reset input
            e.target.value = '';
        }
    };

    return (
        <div
            className={cn(
                "group relative bg-zinc-900 border border-zinc-800 rounded-sm p-8 transition-all duration-300 shadow-xl",
                isDragging && "opacity-50 border-primary ring-2 ring-primary/20 scale-[1.01] bg-primary/5 z-50 shadow-2xl"
            )}
            draggable={!!onDragStart}
            onDragStart={(e) => onDragStart?.(e, scene.id)}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop?.(e, index)}
        >
            <div className="flex gap-8">
                {/* Drag Handle & Index */}
                <div className="flex flex-col items-center gap-4 pt-1">
                    <div className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-50 p-1.5 transition-colors">
                        <GripVertical className="w-5 h-5" />
                    </div>
                    <span className="text-metadata font-black text-zinc-50 bg-zinc-950 w-8 h-8 flex items-center justify-center rounded-none border border-zinc-800 uppercase tracking-widest shadow-inner">
                        {index + 1}
                    </span>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 min-w-0">
                    {isEditing ? (
                        <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                            {/* Technical Meta Row */}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-metadata text-zinc-500 ml-1">Segment Title</label>
                                    <input
                                        type="text"
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-4 py-3 text-sm font-bold text-zinc-50 focus:outline-none focus:border-primary/50 transition-all uppercase tracking-widest"
                                        value={titleValue}
                                        onChange={(e) => setTitleValue(e.target.value)}
                                        placeholder="SCENE_ID_0XX"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-metadata text-zinc-500 ml-1">Production Objective</label>
                                    <input
                                        type="text"
                                        className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-4 py-3 text-sm font-bold text-zinc-50 focus:outline-none focus:border-primary/50 transition-all"
                                        value={goalValue}
                                        onChange={(e) => setGoalValue(e.target.value)}
                                        placeholder="Identify the value prop..."
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-metadata text-zinc-500 ml-1">Scene Goal (Strategic Rationale)</label>
                                <textarea
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-4 py-4 text-sm font-medium text-zinc-300 focus:outline-none focus:border-primary/50 min-h-[80px] transition-all resize-none leading-relaxed"
                                    value={rationaleValue}
                                    onChange={(e) => setRationaleValue(e.target.value)}
                                    placeholder="Explain why this scene is critical for the project goal..."
                                />
                            </div>

                            {/* Core Description Area */}
                            <div className="space-y-2">
                                <label className="text-metadata text-zinc-500 ml-1">Script & Text Content</label>
                                <textarea
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-4 py-4 text-sm font-medium text-zinc-300 focus:outline-none focus:border-primary/50 min-h-[100px] transition-all resize-none leading-relaxed"
                                    value={textValue}
                                    onChange={(e) => setTextValue(e.target.value)}
                                    placeholder="Input script or creative intent..."
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-metadata text-zinc-500 ml-1">Visual Directives</label>
                                <textarea
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-4 py-4 text-sm font-medium text-zinc-300 focus:outline-none focus:border-primary/50 min-h-[100px] transition-all resize-none leading-relaxed"
                                    value={visualValue}
                                    onChange={(e) => setVisualValue(e.target.value)}
                                    placeholder="Define visual composition and requirements..."
                                />
                            </div>

                            {/* Advanced Production Controls */}
                            <div className="pt-2">
                                <CameraControls
                                    cameraConfig={cameraConfig}
                                    motionConfig={motionConfig}
                                    onChange={(cam, mot) => {
                                        setCameraConfig(cam);
                                        setMotionConfig(mot);
                                    }}
                                    onReset={() => {
                                        setCameraConfig({ angle: 'eye_level', movement: 'static', lens: 'standard' });
                                        setMotionConfig({ speed: 'normal', stability: 0.8 });
                                    }}
                                />
                            </div>

                            {/* Asset Binding Section (NEW) */}
                            <div className="space-y-4 pt-4 border-t border-zinc-800">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-metadata font-black uppercase tracking-widest text-zinc-500">Attached Media</span>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger>
                                            <Button variant="secondary" size="md" className="h-10 text-metadata font-bold uppercase tracking-widest gap-2 bg-zinc-950 border-zinc-800 hover:bg-zinc-800 transition-colors rounded-sm">
                                                <ImageIcon className="w-4 h-4" />
                                                Attach Media
                                                <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-80 bg-zinc-900 border-zinc-800 p-3 shadow-3xl">
                                            <div className="p-2 border-b border-zinc-800 mb-3 space-y-2">
                                                <p className="text-metadata font-black uppercase tracking-widest text-zinc-500 text-center">Studio Library</p>
                                                <div className="relative">
                                                    <input
                                                        type="file"
                                                        id={`file-upload-${scene.id}`}
                                                        className="hidden"
                                                        accept="image/*,video/*"
                                                        onChange={handleFileUpload}
                                                        disabled={isUploading}
                                                    />
                                                    <Button
                                                        variant="ghost"
                                                        className="w-full h-10 text-metadata font-bold uppercase tracking-widest gap-2 bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 transition-colors rounded-sm"
                                                        disabled={isUploading}
                                                        onClick={() => document.getElementById(`file-upload-${scene.id}`)?.click()}
                                                    >
                                                        {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                                        Upload New
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
                                                {studioAssets.length === 0 ? (
                                                    <div className="p-8 text-center">
                                                        <p className="text-sm text-zinc-500 font-light italic">No assets uploaded yet</p>
                                                    </div>
                                                ) : (
                                                    studioAssets.map(asset => (
                                                        <DropdownMenuItem
                                                            key={asset.id}
                                                            onClick={() => addAsset(asset.id)}
                                                            className="flex items-center gap-4 p-3 rounded-sm hover:bg-zinc-800 focus:bg-zinc-800 cursor-pointer group/item transition-all"
                                                        >
                                                            <div className="relative w-12 h-12 rounded-sm bg-zinc-950 border border-zinc-800 overflow-hidden shrink-0">
                                                                {asset.type === 'image' ? (
                                                                    <Image src={asset.url} alt="Scene media" fill unoptimized sizes="48px" className="object-cover" />
                                                                ) : (
                                                                    <Film className="w-5 h-5 text-zinc-600 m-3.5" />
                                                                )}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-black text-zinc-300 truncate group-hover/item:text-primary transition-colors">{asset.name}</p>
                                                                <p className="text-metadata text-zinc-600 uppercase font-black tracking-widest">{asset.type}</p>
                                                            </div>
                                                        </DropdownMenuItem>
                                                    ))
                                                )}
                                            </div>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                {sceneAssets.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-3">
                                        {sceneAssets.map(binding => {
                                            const asset = studioAssets.find(a => a.id === binding.asset_id);
                                            return (
                                                <div key={binding.asset_id} className="flex items-center gap-5 p-4 rounded-sm bg-zinc-950 border border-zinc-800 group/asset hover:border-primary/30 transition-all shadow-inner">
                                                    <div className="relative w-12 h-12 rounded-none bg-black border border-zinc-800 overflow-hidden shadow-2xl">
                                                        {asset?.type === 'image' ? (
                                                            <Image src={asset.url} alt="Bound scene media" fill unoptimized sizes="48px" className="object-cover" />
                                                        ) : (
                                                            <Film className="w-5 h-5 text-zinc-800 m-3.5" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-metadata font-black text-zinc-500 truncate uppercase tracking-widest mb-1">{asset?.name || 'Missing Asset'}</p>
                                                        <select
                                                            className="bg-transparent text-metadata font-black uppercase tracking-widest text-primary focus:outline-none cursor-pointer hover:text-zinc-50 transition-colors"
                                                            value={binding.role}
                                                            onChange={(e) => updateAssetRole(binding.asset_id, e.target.value as any)}
                                                        >
                                                            <option value="background">Use as Background</option>
                                                            <option value="reference">Style Reference</option>
                                                            <option value="video_source">Motion Base</option>
                                                            <option value="foreground">Overlay Layer</option>
                                                        </select>
                                                    </div>
                                                    <button
                                                        onClick={() => removeAsset(binding.asset_id)}
                                                        className="p-2.5 rounded-sm hover:bg-red-500/10 text-zinc-600 hover:text-red-500 transition-all"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="px-6 py-4 rounded-sm border border-dashed border-zinc-800 flex items-center justify-center bg-zinc-950/50">
                                        <p className="text-metadata text-zinc-600 uppercase tracking-widest italic">No media attached. AI will generate visuals from scratch.</p>
                                    </div>
                                )}
                            </div>

                            {/* Actions Footer */}
                            {error && <p className="text-red-500 text-metadata font-black uppercase tracking-widest text-center italic">{error}</p>}
                            <div className="flex justify-end gap-4 pt-6 border-t border-zinc-800">
                                <Button
                                    variant="ghost"
                                    size="md"
                                    onClick={handleCancel}
                                    disabled={isPending}
                                    className="text-metadata font-bold uppercase tracking-widest rounded-sm text-zinc-500 hover:text-zinc-50 hover:bg-zinc-800 h-12 px-6"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="md"
                                    onClick={handleSave}
                                    disabled={isPending}
                                    className="primary-cta px-10 h-12"
                                >
                                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    Save Specification
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in duration-500">
                            {/* Static Header Row */}
                            <div className="flex items-start justify-between gap-6 pb-6 border-b border-zinc-800">
                                <div className="space-y-2">
                                    <h4 className="text-zinc-50 font-black text-lg uppercase tracking-widest italic">{scene.scene_title || `SEGMENT_${(index + 1).toString().padStart(3, '0')}`}</h4>
                                    <div className="flex items-center gap-4">
                                        <p className="text-metadata text-zinc-600 font-black uppercase tracking-widest">
                                            Objective: <span className="text-zinc-400 font-bold">{scene.scene_goal}</span>
                                        </p>
                                        <div className="h-4 w-px bg-zinc-800" />
                                        <span className="text-metadata px-3 py-1.5 rounded-sm bg-primary/10 text-primary border border-primary/20 font-black uppercase tracking-widest">
                                            {scene.emotional_beat || 'STUDIO BALANCED'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        className={cn(
                                            "p-2.5 rounded-sm transition-all border border-zinc-800 shadow-sm",
                                            isReadOnly
                                                ? "text-zinc-700 bg-zinc-900 cursor-not-allowed border-zinc-900"
                                                : "text-zinc-500 hover:text-zinc-50 hover:bg-zinc-800 hover:border-zinc-700"
                                        )}
                                        onClick={() => setIsEditing(true)}
                                        disabled={isPending || isReadOnly}
                                        title={isReadOnly ? "Unlock project to edit" : "Edit Scene"}
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                        className={cn(
                                            "p-2.5 rounded-sm transition-all border border-zinc-800 shadow-sm",
                                            isReadOnly
                                                ? "text-zinc-700 bg-zinc-900 cursor-not-allowed border-zinc-900"
                                                : "text-zinc-500 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/20"
                                        )}
                                        onClick={handleDeleteClick}
                                        disabled={isPending || isReadOnly}
                                        title={isReadOnly ? "Unlock project to delete" : "Delete Scene"}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Script & Action Box */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 rounded-sm bg-zinc-950 border border-zinc-800 relative shadow-inner">
                                    <span className="absolute -top-3 left-6 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-sm text-metadata font-black uppercase tracking-widest text-zinc-500">Script & Text</span>
                                    <p className="text-zinc-400 text-sm leading-relaxed font-medium pt-2">
                                        &quot;{scene.scene_text}&quot;
                                    </p>
                                </div>
                                <div className="p-6 rounded-sm bg-primary/5 border border-primary/10 relative shadow-inner">
                                    <span className="absolute -top-3 left-6 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-sm text-metadata font-black uppercase tracking-widest text-primary">Action & Movement</span>
                                    <p className="text-zinc-300 text-sm leading-relaxed font-medium pt-2 italic">
                                        {scene.action_sequence || 'Awaiting cinematic execution...'}
                                    </p>
                                </div>
                            </div>

                            {/* Strategic Rationale (Gap Group B) */}
                            {scene.why_this_scene_exists && (
                                <div className="p-6 rounded-sm bg-zinc-950 border border-zinc-800 flex items-center gap-6 shadow-inner">
                                    <div className="w-10 h-10 rounded-none bg-zinc-900 flex items-center justify-center shrink-0 border border-zinc-800">
                                        <Plus className="w-5 h-5 text-zinc-600 rotate-45" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-metadata font-black uppercase tracking-widest text-zinc-500">Scene Goal</p>
                                        <p className="text-sm text-zinc-400 font-medium italic">"{scene.why_this_scene_exists}"</p>
                                    </div>
                                </div>
                            )}

                            {/* Media Binding Preview */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <span className="text-metadata font-black uppercase tracking-widest text-zinc-500 ml-1">Visual Directives</span>
                                    <div className="space-y-3">
                                        <div className="text-sm text-zinc-400 font-medium leading-relaxed p-4 rounded-sm bg-zinc-950 border border-zinc-800 shadow-inner">
                                            {scene.visual_description}
                                        </div>
                                        {/* Camera Summary */}
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            {scene.camera_config?.angle && (
                                                <span className="text-metadata px-3 py-1.5 rounded-sm bg-zinc-900 text-zinc-500 border border-zinc-800 uppercase font-black tracking-widest">
                                                    Angle: {scene.camera_config.angle.replace('_', ' ')}
                                                </span>
                                            )}
                                            {scene.camera_config?.movement && (
                                                <span className="text-metadata px-3 py-1.5 rounded-sm bg-zinc-900 text-zinc-500 border border-zinc-800 uppercase font-black tracking-widest">
                                                    Move: {scene.camera_config.movement.replace('_', ' ')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <span className="text-metadata font-black uppercase tracking-widest text-zinc-500 ml-1">Media Attachments</span>
                                    {scene.scene_assets && scene.scene_assets.length > 0 ? (
                                        <div className="flex flex-wrap gap-3">
                                            {scene.scene_assets.map(binding => {
                                                const asset = studioAssets.find(a => a.id === binding.asset_id);
                                                return (
                                                    <div key={binding.asset_id} className="flex items-center gap-3 pl-1 pr-4 py-1.5 rounded-sm bg-primary/10 border border-primary/20 group/tag">
                                                        <div className="relative w-8 h-8 rounded-none overflow-hidden bg-black flex items-center justify-center shrink-0 border border-zinc-800 shadow-2xl">
                                                            {asset?.type === 'image' ? (
                                                                <Image src={asset.url} alt="Bound scene media" fill unoptimized sizes="32px" className="object-cover" />
                                                            ) : (
                                                                <Film className="w-4 h-4 text-primary" />
                                                            )}
                                                        </div>
                                                        <span className="text-metadata font-black uppercase tracking-widest text-primary italic">
                                                            {binding.role}: {asset?.name.split('.')[0] || 'STATION ASSET'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="h-[60px] rounded-sm border border-dashed border-zinc-800 flex items-center justify-center bg-zinc-950/30">
                                            <span className="text-metadata text-zinc-600 uppercase font-black tracking-[0.3em] italic">AI Generative Mode</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {scene.differentiation_note && (
                                <div className="flex items-start gap-2 pt-2 text-[10px] text-zinc-400">
                                    <AlertCircle className="w-3 h-3 shrink-0" />
                                    <p className="font-medium">Continuity Note: {scene.differentiation_note}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Float Actions */}
            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent className="sm:max-w-md border-zinc-800 bg-zinc-950/90 backdrop-blur-xl shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-zinc-50">Delete Scene {index + 1}?</DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            This action cannot be undone. This scene will be permanently removed from the blueprint.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="ghost"
                            onClick={() => setIsDeleteDialogOpen(false)}
                            className="h-10 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleConfirmDelete}
                            className="h-10 bg-red-900/20 text-red-400 hover:bg-red-900/40 hover:text-red-300 border border-red-900/50"
                        >
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            Delete Scene
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
