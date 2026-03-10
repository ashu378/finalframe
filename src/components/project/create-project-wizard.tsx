'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Video,
    MonitorSmartphone,
    User,
    Zap,
    ChevronRight,
    ChevronLeft,
    Check,
    Loader2,
    Upload,
    ShieldCheck,
    X
} from 'lucide-react';
import { createProject, getStudioContext } from '@/lib/project/actions';
import { uploadAsset, updateAssetTags } from '@/lib/assets/actions';
import { cn } from '@/lib/utils';
import { ProjectContentType, CreativeDNASnapshot, MessageBlocksSnapshot } from '@/lib/types/database';
import { toast } from 'sonner';
import { useEffect } from 'react';

interface CreateProjectWizardProps {
    onClose: () => void;
    studioId?: string;
}

const STEPS = [
    { title: 'Project Core', description: 'Technical name and segment' },
    { title: 'Production Intent', description: 'Narrative vision and goal' },
    { title: 'Visual Material', description: 'Technical reference layers' },
    { title: 'Studio Directives', description: 'Inherited brand identity' },
    { title: 'Final Review', description: 'Finalize and start' }
];

const CONTENT_TYPES: { id: ProjectContentType; label: string; icon: any; description: string }[] = [
    { id: 'commercial', label: 'Commercial', icon: Video, description: 'High-energy storytelling' },
    { id: 'saas_demo', label: 'Product Demo', icon: MonitorSmartphone, description: 'Showcase software UI' },
    { id: 'ugc', label: 'UGC Style', icon: User, description: 'Authentic creator content' },
    { id: 'motion_graphics', label: 'Motion Graphics', icon: Zap, description: 'Dynamic text & shapes' },
];

const GOALS = [
    { id: 'get_attention', label: 'Get Attention', emoji: '👀' },
    { id: 'explain_value', label: 'Explain Value', emoji: '💡' },
    { id: 'convert_sales', label: 'Convert Sales', emoji: '💰' },
    { id: 'social_growth', label: 'Social Growth', emoji: '📈' },
    { id: 'brand_story', label: 'Brand Story', emoji: '📖' },
    { id: 'education', label: 'Educational', emoji: '🎓' },
];

export function CreateProjectWizard({ onClose, studioId }: CreateProjectWizardProps) {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // =====================================================
    // LOCAL STATE — NO DATABASE WRITES UNTIL STEP 5
    // =====================================================
    const [name, setName] = useState('');
    const [contentType, setContentType] = useState<ProjectContentType | null>(null);
    const [description, setDescription] = useState('');
    const [goal, setGoal] = useState<string>('get_attention');

    // Studio Defaults & Context
    const [studioContext, setStudioContext] = useState<any>(null);
    const [dnaOverrides, setDnaOverrides] = useState<Partial<CreativeDNASnapshot>>({});
    const [blocksOverrides, setBlocksOverrides] = useState<Partial<MessageBlocksSnapshot>>({});
    const [platformOverride, setPlatformOverride] = useState<string>('');
    const [identityOverride, setIdentityOverride] = useState<string>('');
    const [showOverrides, setShowOverrides] = useState(false);

    useEffect(() => {
        async function loadContext() {
            const res = await getStudioContext();
            if (res.success) {
                setStudioContext(res);
            }
        }
        loadContext();
    }, []);

    // Staged assets (File objects held in memory)
    const [stagedFiles, setStagedFiles] = useState<File[]>([]);

    // =====================================================
    // NAVIGATION HANDLERS — NO DB WRITES
    // =====================================================
    const handleNext = () => {
        // Validation guards
        if (currentStep === 0 && (!name || !contentType)) {
            toast.error('Please enter a name and select a content type');
            return;
        }
        if (currentStep === 1 && (!description || description.length < 10)) {
            toast.error('Please enter a description (at least 10 characters)');
            return;
        }
        setCurrentStep(prev => prev + 1);
    };

    const handleBack = () => setCurrentStep(prev => Math.max(0, prev - 1));

    // =====================================================
    // STEP 5: ATOMIC PROJECT CREATION
    // =====================================================
    const handleCreateProject = async () => {
        if (!name || !contentType || !description) {
            toast.error('Missing required fields');
            return;
        }

        console.log('[WIZARD] handleCreateProject started', { name, contentType, goal });
        setIsLoading(true);

        try {
            // 1. CREATE PROJECT (ATOMIC) with 15s Timeout
            const projectPromise = createProject({
                name,
                contentType,
                description,
                outcomeGoal: goal,
                dnaOverride: dnaOverrides,
                blocksOverride: blocksOverrides,
                platform: platformOverride || undefined,
                identityPresence: identityOverride || undefined,
            });

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Server action timed out after 15s')), 15000)
            );

            console.log('[WIZARD] Calling createProject server action...');
            const res = await Promise.race([projectPromise, timeoutPromise]) as any;
            console.log('[WIZARD] createProject response:', res);

            if (!res.success || !res.projectId) {
                toast.error(res.error || 'Failed to create project');
                setIsLoading(false);
                return;
            }

            const projectId = res.projectId;

            // 2. UPLOAD AND ATTACH STAGED ASSETS
            if (stagedFiles.length > 0 && studioId) {
                console.log(`[WIZARD] Uploading ${stagedFiles.length} files...`);
                for (const file of stagedFiles) {
                    const formData = new FormData();
                    formData.append('file', file);
                    const uploadRes = await uploadAsset(studioId, formData);
                    if (uploadRes.success && uploadRes.asset) {
                        await updateAssetTags(uploadRes.asset.id, [`project:${projectId}`]);
                    }
                }
            }

            // 3. REDIRECT TO BLUEPRINT
            toast.success('Project created successfully!');
            console.log('[WIZARD] Redirecting to blueprint...', projectId);
            router.push(`/dashboard/projects/${projectId}/blueprint`);

        } catch (e: any) {
            console.error('[WIZARD] Project creation error:', e);
            toast.error(e.message || 'Something went wrong');
            setIsLoading(false);
        }
    };

    // =====================================================
    // ASSET STAGING (IN MEMORY — NO UPLOAD YET)
    // =====================================================
    const handleFileStage = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files.length) return;
        const files = Array.from(e.target.files);
        setStagedFiles(prev => [...prev, ...files]);
        toast.success(`${files.length} file(s) staged`);
        // Reset input value so the same file(s) can be selected again and to clear browser tooltips
        e.target.value = '';
    };

    const removeStagedFile = (index: number) => {
        setStagedFiles(prev => prev.filter((_, i) => i !== index));
    };

    // =====================================================
    // RENDER
    // =====================================================
    return (
        <div className="flex flex-col lg:flex-row h-full lg:h-[620px] max-h-[90vh] w-full max-w-[1050px] bg-black text-white rounded-sm overflow-hidden border border-white/5 shadow-2xl relative">
            {/* Left Column: Vision & Progress */}
            <div className="w-full lg:w-1/3 p-6 lg:p-12 bg-zinc-950 relative overflow-hidden flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-white/5">
                <div className="absolute top-[-80px] left-[-80px] w-[300px] h-[300px] bg-primary/5 blur-[80px] rounded-full" />

                <div className="relative z-10">
                    <div className="flex gap-2 mb-8 lg:mb-12">
                        {STEPS.map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "h-0.5 rounded-sm transition-all duration-700",
                                    i === currentStep ? "w-10 bg-primary shadow-[0_0_10px_rgba(251,191,36,0.3)]" : i < currentStep ? "w-2 bg-primary/40" : "w-1 bg-zinc-800"
                                )}
                            />
                        ))}
                    </div>

                    <h1 className="text-[22px] font-black text-white uppercase tracking-[0.1em] mb-4 italic">
                        {STEPS[currentStep].title}
                    </h1>
                    <p className="text-zinc-400 font-bold text-[10px] uppercase tracking-widest leading-loose">
                        {STEPS[currentStep].description}
                    </p>
                </div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 text-zinc-500 text-[9px] uppercase font-black tracking-[0.2em]">
                        <span>Registry</span>
                        <div className="w-1 h-1 rounded-full bg-primary/30" />
                        <span>Production Mastering</span>
                    </div>
                </div>
            </div>

            {/* Right Column: Interaction */}
            <div className="flex-1 flex flex-col bg-[#050505] relative min-h-0">
                <Button
                    variant="ghost"
                    onClick={onClose}
                    className="absolute top-3 right-3 lg:top-5 lg:right-5 text-zinc-500 hover:text-white hover:bg-zinc-900 rounded-full h-8 w-8 !p-0 z-50"
                >
                    <X className="w-4 h-4" />
                </Button>

                <div className="flex-1 overflow-y-auto p-6 lg:p-12 flex flex-col">
                    {/* STEP 1: PROJECT BASICS */}
                    {currentStep === 0 && (
                        <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] px-1">Project Name</label>
                                <Input
                                    placeholder="Enter project name..."
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="bg-black/60 border-zinc-800 border-x-0 border-t-0 border-b rounded-none px-1 py-4 h-auto text-[18px] font-black tracking-tight focus:ring-0 focus:border-primary/50 transition-all placeholder:text-zinc-600 uppercase"
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] px-1">Content Type</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {CONTENT_TYPES.map(type => (
                                        <div
                                            key={type.id}
                                            onClick={() => setContentType(type.id)}
                                            className={cn(
                                                "p-5 rounded-sm border transition-all duration-300 cursor-pointer flex flex-col items-start gap-4",
                                                contentType === type.id
                                                    ? "bg-primary/5 border-primary shadow-[0_0_20px_rgba(251,191,36,0.1)]"
                                                    : "bg-black/40 border-white/5 hover:border-white/10"
                                            )}
                                        >
                                            <type.icon className={cn("w-4 h-4", contentType === type.id ? "text-primary" : "text-zinc-500")} />
                                            <div>
                                                <div className="text-[11px] font-black text-white mb-1 uppercase tracking-widest">{type.label}</div>
                                                <div className="text-[9px] font-bold text-zinc-400 leading-tight uppercase tracking-tight">{type.description}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: CREATIVE INTENT */}
                    {currentStep === 1 && (
                        <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                            <div className="space-y-3">
                                <div className="flex justify-between items-center px-1">
                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Description / Vision</label>
                                    <span className={cn("text-[9px] font-mono", description.length >= 10 ? "text-green-500" : "text-zinc-500")}>
                                        {description.length} / 10
                                    </span>
                                </div>
                                <textarea
                                    placeholder="What is your video about?"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    className="w-full h-[180px] bg-black/60 border border-white/5 rounded-sm p-5 text-[14px] font-bold text-white resize-none focus:outline-none focus:border-primary/40 transition-all placeholder:text-zinc-600 uppercase tracking-tight leading-relaxed"
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] px-1">Primary Goal</label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {GOALS.map((g) => (
                                        <button
                                            key={g.id}
                                            onClick={() => setGoal(g.id)}
                                            className={cn(
                                                "py-4 rounded-sm border text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300",
                                                goal === g.id
                                                    ? "bg-primary border-primary text-black shadow-lg shadow-primary/20"
                                                    : "bg-black/40 border-white/5 text-zinc-500 hover:border-white/10 hover:text-zinc-300"
                                            )}
                                        >
                                            <span className="text-base mr-2">{g.emoji}</span>
                                            {g.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: VISUAL INPUTS (OPTIONAL) */}
                    {currentStep === 2 && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
                                {/* Left Side: Dropzone */}
                                <div className={cn(
                                    "border-2 border-dashed rounded-sm p-8 flex flex-col items-center justify-center text-center transition-all",
                                    stagedFiles.length > 0 ? "border-primary/20 bg-primary/5" : "border-white/5 bg-black/40"
                                )}>
                                    <div className="w-12 h-12 rounded-sm bg-black flex items-center justify-center mb-6 border border-white/5 shadow-xl">
                                        <Upload className="w-5 h-5 text-zinc-500" />
                                    </div>
                                    <h3 className="text-[12px] font-black uppercase tracking-widest mb-3">Upload Assets</h3>
                                    <p className="text-[9px] font-bold text-zinc-400 mb-8 max-w-[200px] uppercase tracking-widest leading-loose">
                                        Upload technical references or skip to use studio defaults.
                                    </p>

                                    <div className="relative">
                                        <Button variant="secondary" className="bg-primary text-black hover:bg-white h-10 text-[10px] font-black uppercase tracking-[0.2em] px-8 rounded-sm pointer-events-none">
                                            Upload Files
                                        </Button>
                                        <input
                                            type="file"
                                            multiple
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            onChange={handleFileStage}
                                        />
                                    </div>
                                </div>

                                {/* Right Side: Staged List */}
                                <div className="flex flex-col min-h-0">
                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4">
                                        Staging Area {stagedFiles.length > 0 && `(${stagedFiles.length})`}
                                    </label>

                                    {stagedFiles.length > 0 ? (
                                        <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar flex-1">
                                            {stagedFiles.map((file, i) => (
                                                <div key={`${file.name}-${i}`} className="flex items-center justify-between p-4 rounded-sm bg-black/60 border border-white/5 animate-in fade-in slide-in-from-right-2 duration-300">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-8 h-8 bg-primary/10 rounded-sm flex items-center justify-center border border-primary/20">
                                                            <Check className="w-4 h-4 text-primary" />
                                                        </div>
                                                        <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest truncate max-w-[140px]">{file.name}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => removeStagedFile(i)}
                                                        className="text-zinc-600 hover:text-primary transition-colors p-1"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col items-center justify-center border border-zinc-900 rounded-2xl bg-zinc-950/20 text-center p-6">
                                            <p className="text-xs text-zinc-500 italic">No files staged yet.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: BRAND & DEFAULTS */}
                    {currentStep === 3 && (
                        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto w-full">
                            <div className="text-center mb-4">
                                <h2 className="text-xl font-light">Studio Identity & Context</h2>
                                <p className="text-xs text-zinc-400 mt-1">AI uses these defaults from your onboarding to ensure brand consistency.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-8 rounded-sm bg-black/40 border border-white/5 flex flex-col items-center text-center gap-6 relative overflow-hidden group hover:border-primary/30 transition-all">
                                    <div className="w-14 h-14 bg-primary/10 rounded-sm flex items-center justify-center border border-primary/20 group-hover:scale-105 transition-transform shadow-2xl">
                                        <MonitorSmartphone className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-400 font-black mb-2">Target Platform</div>
                                        <div className="text-[12px] font-black text-white uppercase tracking-widest">{studioContext?.defaults?.platform?.replace('_', ' ') || 'No Default Set'}</div>
                                    </div>
                                </div>
                                <div className="p-8 rounded-sm bg-black/40 border border-white/5 flex flex-col items-center text-center gap-6 relative overflow-hidden group hover:border-primary/30 transition-all">
                                    <div className="w-14 h-14 bg-primary/10 rounded-sm flex items-center justify-center border border-primary/20 group-hover:scale-105 transition-transform shadow-2xl">
                                        <User className="w-6 h-6 text-primary" />
                                    </div>
                                    <div>
                                        <div className="text-[9px] uppercase tracking-[0.2em] text-zinc-600 font-black mb-2">Identity Presence</div>
                                        <div className="text-[12px] font-black text-white uppercase tracking-widest">{studioContext?.defaults?.identity_presence?.replace('_', ' ') || 'No Default Set'}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <button
                                    onClick={() => setShowOverrides(!showOverrides)}
                                    className="w-full py-4 rounded-xl border border-zinc-900 bg-zinc-900/20 text-zinc-400 text-xs font-bold uppercase tracking-widest hover:bg-zinc-900/40 hover:text-zinc-300 transition-all flex items-center justify-center gap-2"
                                >
                                    {showOverrides ? 'Hide Customization' : 'Customize for this Project'}
                                    <ChevronRight className={cn("w-4 h-4 transition-transform", showOverrides ? "rotate-90" : "")} />
                                </button>

                                {showOverrides && (
                                    <div className="grid grid-cols-2 gap-6 p-8 rounded-sm bg-black/60 border border-primary/20 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="space-y-4">
                                            <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest px-1">Overwrite Platform</label>
                                            <select
                                                value={platformOverride}
                                                onChange={e => setPlatformOverride(e.target.value)}
                                                className="w-full h-11 bg-black border border-white/5 text-[10px] font-black uppercase tracking-widest px-4 rounded-sm focus:outline-none focus:border-primary/40 text-zinc-300"
                                            >
                                                <option value="">(Inherit Studio Default)</option>
                                                <option value="tiktok_reels">TikTok / Reels</option>
                                                <option value="youtube">YouTube</option>
                                                <option value="x_twitter">X / Twitter</option>
                                                <option value="website_landing">Website / Landing</option>
                                            </select>
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest px-1">Overwrite Presence</label>
                                            <select
                                                value={identityOverride}
                                                onChange={e => setIdentityOverride(e.target.value)}
                                                className="w-full h-11 bg-black border border-white/5 text-[10px] font-black uppercase tracking-widest px-4 rounded-sm focus:outline-none focus:border-primary/40 text-zinc-300"
                                            >
                                                <option value="">(Inherit Studio Default)</option>
                                                <option value="self">Self (Creator)</option>
                                                <option value="ai_actor">AI Digital Actor</option>
                                                <option value="no_people">No People / Motion Only</option>
                                            </select>
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest px-1">Brand Energy Directive</label>
                                            <Input
                                                placeholder={studioContext?.dna?.brand_energy || "Inherit Studio Energy"}
                                                value={dnaOverrides.brand_energy || ''}
                                                onChange={e => setDnaOverrides(prev => ({ ...prev, brand_energy: e.target.value }))}
                                                className="bg-black border-white/5 text-[10px] font-black uppercase tracking-widest py-3 h-11 rounded-sm"
                                            />
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[9px] font-black text-zinc-600 uppercase tracking-widest px-1">Value Proposition Directive</label>
                                            <Input
                                                placeholder={studioContext?.blocks?.value_proposition || "Inherit Studio Value Prop"}
                                                value={blocksOverrides.value_proposition || ''}
                                                onChange={e => setBlocksOverrides(prev => ({ ...prev, value_proposition: e.target.value }))}
                                                className="bg-black border-white/5 text-[10px] font-black uppercase tracking-widest py-3 h-11 rounded-sm"
                                            />
                                        </div>
                                    </div>
                                )}

                                {!showOverrides && (
                                    <div className="p-6 rounded-sm bg-black border border-white/5 flex items-center gap-6">
                                        <div className="w-10 h-10 rounded-sm bg-primary/10 flex items-center justify-center border border-primary/20">
                                            <ShieldCheck className="w-5 h-5 text-primary/60" />
                                        </div>
                                        <div>
                                            <div className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Studio Defaults Active</div>
                                            <div className="text-[9px] font-bold text-zinc-500 mt-1 uppercase tracking-widest leading-loose">
                                                Branding settings applied.
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* STEP 5: CONFIRM & CREATE */}
                    {currentStep === 4 && (
                        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto w-full">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-light">Ready to create?</h2>
                                <p className="text-sm text-zinc-500 mt-2">Review your project details before launching.</p>
                            </div>

                            <div className="grid gap-2">
                                {[
                                    { label: 'Name', value: name },
                                    { label: 'Type', value: contentType?.replace('_', ' ') || '-', capitalize: true },
                                    { label: 'Goal', value: GOALS.find(g => g.id === goal)?.label || goal },
                                    { label: 'Vision', value: description, truncate: true },
                                    { label: 'Directives', value: dnaOverrides.brand_energy ? 'Modified' : 'Standard', status: dnaOverrides.brand_energy ? 'warning' : 'success' },
                                    { label: 'Output', value: `${stagedFiles.length} Material Layers` }
                                ].map((row, i) => (
                                    <div key={i} className="p-5 rounded-sm bg-black/40 border border-white/5 flex justify-between items-center group/row hover:border-primary/20 transition-all">
                                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{row.label}</span>
                                        <div className="flex items-center gap-3">
                                            {row.status && (
                                                <div className={cn(
                                                    "w-1.5 h-1.5 rounded-full shrink-0 shadow-[0_0_8px_currentColor]",
                                                    row.status === 'success' ? "bg-emerald-500" : "bg-primary"
                                                )} />
                                            )}
                                            <span className={cn(
                                                "text-[11px] font-black text-white uppercase tracking-widest",
                                                row.truncate && "max-w-[240px] truncate text-zinc-400 font-bold"
                                            )}>
                                                {row.value}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-black border border-white/5 rounded-sm p-4 text-center">
                                <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-loose">
                                    All set! Click below to start.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 lg:p-8 lg:px-16 border-t border-zinc-950 flex justify-between items-center bg-[#050505]">
                    <Button
                        variant="secondary"
                        size="md"
                        onClick={handleBack}
                        disabled={currentStep === 0}
                        className={cn(
                            "px-8 lg:px-10 h-11 transition-all",
                            currentStep === 0 ? "opacity-0 pointer-events-none" : "opacity-100"
                        )}
                    >
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>

                    {currentStep === STEPS.length - 1 ? (
                        <Button
                            onClick={handleCreateProject}
                            disabled={isLoading}
                            className="px-12 lg:px-14 h-12 text-[10px] font-black uppercase tracking-[0.2em] rounded-sm bg-primary text-black transition-all group shadow-2xl shadow-primary/20"
                        >
                            {isLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-3" />
                            ) : (
                                <Zap className="w-4 h-4 mr-3 group-hover:scale-125 transition-transform" />
                            )}
                            Create Project
                        </Button>
                    ) : (
                        <Button
                            onClick={handleNext}
                            className="px-12 lg:px-14 h-12 text-[10px] font-black uppercase tracking-[0.2em] rounded-sm bg-primary text-black transition-all group shadow-2xl shadow-primary/20"
                        >
                            {currentStep === 2 && stagedFiles.length === 0 ? 'Skip for now' : 'Next Step'}
                            <ChevronRight className="w-4 h-4 ml-3 group-hover:translate-x-1 transition-transform" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
