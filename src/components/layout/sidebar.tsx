/**
 * FinalFrame — Dashboard Sidebar Component
 * Reference: MASTER_PRD.md § 5.II — User Dashboard navigation
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';
import { signOut } from '@/lib/auth/actions';
import { Sparkles, Home, LayoutGrid, FolderOpen, Settings, LogOut, LayoutTemplate } from 'lucide-react';

const navItems = [
    { href: '/dashboard', label: 'Productions', icon: LayoutGrid },
    { href: '/dashboard/assets', label: 'Library', icon: FolderOpen },
    { href: '/dashboard/templates', label: 'Templates', icon: LayoutTemplate },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

/**
 * Dashboard sidebar with navigation
 */
export function Sidebar() {
    const pathname = usePathname();

    const handleSignOut = async () => {
        await signOut();
    };

    return (
        <aside className="w-64 h-full border-r border-white/5 bg-black/40 backdrop-blur-xl flex flex-col">
            {/* Logo */}
            <div className="h-16 flex items-center px-6 border-b border-white/5">
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="w-6 h-6 rounded-sm bg-primary flex items-center justify-center shadow-lg shadow-primary/20 transition-transform">
                        <div className="w-2 h-2 bg-black rounded-sm" />
                    </div>
                    <span className="font-black text-[12px] tracking-[0.3em] uppercase text-white italic">
                        FinalFrame
                    </span>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (pathname?.startsWith(item.href) && item.href !== '/dashboard');
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-3 rounded-sm text-sm uppercase tracking-widest font-bold transition-all duration-200 group relative
                                ${isActive
                                    ? 'text-primary bg-zinc-800 ring-1 ring-primary/20 shadow-[inset_0_0_20px_rgba(251,191,36,0.05)] shadow-xl'
                                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50'
                                }
                            `}
                        >
                            <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-primary' : 'text-zinc-600 group-hover:text-zinc-300'}`} />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer / Sign Out */}
            <div className="p-4 border-t border-white/5">
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-sm text-metadata text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors group"
                >
                    <LogOut className="w-4 h-4 text-zinc-500 group-hover:text-red-400" />
                    Log Out
                </button>
            </div>
        </aside>
    );
}
