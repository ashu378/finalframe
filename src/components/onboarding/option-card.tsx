interface OptionCardProps {
    label: string;
    description?: string;
    selected: boolean;
    onClick: () => void;
    className?: string;
}

export function OptionCard({ label, description, selected, onClick }: OptionCardProps) {
    return (
        <button
            type="button"
            className={`
                w-full text-left p-6 rounded-sm border transition-all duration-300 group relative overflow-hidden outline-none shadow-xl
                ${selected
                    ? 'bg-zinc-900 border-primary ring-1 ring-primary/20 shadow-primary/5'
                    : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                }
            `}
            onClick={onClick}
        >
            {/* Selection Glow Indicator */}
            {selected && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary shadow-[0_0_15px_#fbbf24]" />
            )}

            <div className="pl-4">
                <div className={`text-base font-black mb-1 transition-colors uppercase tracking-[0.1em] ${selected ? 'text-primary italic' : 'text-zinc-50 group-hover:text-primary'}`}>
                    {label}
                </div>
                {description && (
                    <div className={`text-metadata transition-colors normal-case leading-relaxed ${selected ? 'text-zinc-300' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                        {description}
                    </div>
                )}
            </div>
        </button>
    );
}
