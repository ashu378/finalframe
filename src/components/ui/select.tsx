'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

// For this simplified version (since we lack Radix), we will wrap a native <select> 
// but style it to look custom. This ensures accessibility and functionality without complex custom logic.

interface SelectProps {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
}



export function SelectTrigger({ className, children }: { className?: string; children: React.ReactNode }) {
    // This is purely visual in our "native-hybrid" approach if we were using a hidden select, 
    // but building a fully custom dropdown properly is hard. 
    // Let's actually build a Custom Dropdown using state since the users want a "wow" UI.
    // Native select is ugly.

    // We need to access the context to toggle open/close?
    // Actually, to keep this file simple and compatible with the "shadcn syntax" used in export-modal,
    // we need to implement the full composed component pattern.

    // Let's switch to a "Native Select" disguised as custom for reliability if we can,
    // BUT the usage in export-modal expects `SelectContent` and `SelectItem`.
    // So we MUST implement the context-based custom select.
    return (
        <SelectTriggerImpl className={className}>{children}</SelectTriggerImpl>
    );
}

// Internal implementation to handle state
function SelectTriggerImpl({ className, children }: { className?: string; children: React.ReactNode }) {
    const { isOpen, setIsOpen, value } = useSelectState();

    return (
        <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
                "flex h-10 w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                className
            )}
        >
            {children}
            <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
    );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
    const { value } = useSelectState();
    return <span>{value || placeholder}</span>;
}

export function SelectContent({ className, children }: { className?: string; children: React.ReactNode }) {
    const { isOpen, setIsOpen } = useSelectState();

    if (!isOpen) return null;

    return (
        <>
            <div
                className="fixed inset-0 z-50"
                onClick={() => setIsOpen(false)}
            />
            <div className={cn(
                "absolute z-50 min-w-[8rem] overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 text-zinc-50 shadow-md animate-in fade-in-0 zoom-in-95 mt-1 w-full",
                className
            )}>
                <div className="p-1">
                    {children}
                </div>
            </div>
        </>
    );
}

export function SelectItem({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
    const { onValueChange, setIsOpen, value: selectedValue } = useSelectState();

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                onValueChange(value);
                setIsOpen(false);
            }}
            className={cn(
                "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-2 text-sm outline-none hover:bg-zinc-800 focus:bg-zinc-800 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 cursor-pointer",
                selectedValue === value && "bg-zinc-800/50",
                className
            )}
        >
            <span className="truncate">{children}</span>
        </div>
    );
}

// -- State Management --

interface SelectState {
    value: string;
    onValueChange: (val: string) => void;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
}

// We need a way to pass state down. Since `Select` wraps everything, we can do it there.
// But `Select` component definition above only took value/onChange. 
// We need to wrap it with internal state handling.

const SelectStateContext = React.createContext<SelectState | null>(null);

function useSelectState() {
    const context = React.useContext(SelectStateContext);
    if (!context) throw new Error("Select components must be used within <Select>");
    return context;
}

// Re-implement the top-level Select to include the toggle state
export function Select({ value, onValueChange, children }: SelectProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <SelectStateContext.Provider value={{ value, onValueChange, isOpen, setIsOpen }}>
            <div className="relative w-full">
                {children}
            </div>
        </SelectStateContext.Provider>
    );
}
