'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from "@/lib/utils";

// Simplified context for managing open state
interface DropdownContextType {
    isOpen: boolean;
    setIsOpen: (v: boolean) => void;
    triggerRect: DOMRect | null;
    setTriggerRect: (rect: DOMRect | null) => void;
}
const DropdownContext = React.createContext<DropdownContextType>({
    isOpen: false,
    setIsOpen: () => { },
    triggerRect: null,
    setTriggerRect: () => { }
});

export function DropdownMenu({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [triggerRect, setTriggerRect] = React.useState<DOMRect | null>(null);
    return (
        <DropdownContext.Provider value={{ isOpen, setIsOpen, triggerRect, setTriggerRect }}>
            <div className="relative inline-block text-left">
                {children}
            </div>
        </DropdownContext.Provider>
    );
}

export function DropdownMenuTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
    const { isOpen, setIsOpen, setTriggerRect } = React.useContext(DropdownContext);
    const triggerRef = React.useRef<HTMLDivElement>(null);

    // If asChild is true, we should strictly cloneElement, but for simplicity in this fallback:
    // We just wrap it. IF it breaks layout, we'll fix it. 
    // Usually standard shadcn/radix usage involves `asChild`, implying the child is the button.

    return (
        <div
            ref={triggerRef}
            onClick={(e) => {
                e.stopPropagation();
                if (triggerRef.current) {
                    setTriggerRect(triggerRef.current.getBoundingClientRect());
                }
                setIsOpen(!isOpen);
            }}
            className="inline-block cursor-pointer"
        >
            {children}
        </div>
    );
}

export function DropdownMenuContent({ children, className, align = 'end' }: { children: React.ReactNode; className?: string; align?: 'start' | 'end' | 'center' }) {
    const { isOpen, setIsOpen, triggerRect } = React.useContext(DropdownContext);

    if (!isOpen || !triggerRect) return null;

    const top = triggerRect.bottom + window.scrollY;
    const left = align === 'end'
        ? triggerRect.right + window.scrollX
        : triggerRect.left + window.scrollX;

    const content = (
        <>
            <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
            <div className={cn(
                "absolute z-[101] overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 p-1 text-zinc-50 shadow-2xl backdrop-blur-2xl animate-in fade-in-0 zoom-in-95",
                className
            )}
                style={{
                    top: `${top + 8}px`,
                    left: `${left}px`,
                    transform: align === 'end' ? 'translateX(-100%)' : 'none',
                    minWidth: '160px'
                }}>
                {children}
            </div>
        </>
    );

    // If we're on the client, use portal to body
    if (typeof document !== 'undefined') {
        return createPortal(content, document.body);
    }

    return null;
}

export function DropdownMenuItem({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
    const { setIsOpen } = React.useContext(DropdownContext);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick?.();
        setIsOpen(false);
    };

    return (
        <div
            onClick={handleClick}
            className={cn(
                "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-zinc-800 focus:bg-zinc-800 cursor-pointer",
                className
            )}
        >
            {children}
        </div>
    );
}

export function DropdownMenuLabel({ children, className }: { children: React.ReactNode; className?: string }) {
    return <div className={cn("px-2 py-1.5 text-sm font-semibold", className)}>{children}</div>;
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
    return <div className={cn("-mx-1 my-1 h-px bg-zinc-800", className)} />;
}
