/**
 * FinalFrame — Signup Page
 */

import Link from 'next/link';
import { signUp } from '@/lib/auth/actions';

export const metadata = {
    title: 'Sign Up',
    description: 'Create your FinalFrame account',
};

export default function SignupPage() {
    return (
        <div className="bg-zinc-900 border border-zinc-800 p-10 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-10 opacity-[0.02] group-hover:opacity-5 transition-opacity duration-1000">
                <div className="w-32 h-32 border-2 border-primary rotate-12" />
            </div>
            <div className="text-center mb-10 relative z-10">
                <h1 className="text-lg font-black uppercase tracking-[0.3em] mb-4 text-zinc-50 italic">Registry Enrollment</h1>
                <p className="text-metadata text-zinc-400 mt-6">
                    Initialize master account for production management.
                </p>
            </div>

            <form action={signUp} className="flex flex-col gap-6">
                <div className="space-y-3">
                    <label htmlFor="fullName" className="text-metadata text-zinc-400 px-1">
                        Master Identity (Full Name)
                    </label>
                    <input
                        type="text"
                        id="fullName"
                        name="fullName"
                        required
                        placeholder="NAME_REQUIRED..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-5 py-4 text-sm font-bold text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 transition-all uppercase tracking-widest"
                    />
                </div>

                <div className="space-y-3">
                    <label htmlFor="email" className="text-metadata text-zinc-400 px-1">
                        Access ID (Email)
                    </label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        placeholder="PRODUCER_ID..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-5 py-4 text-sm font-bold text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 transition-all uppercase tracking-widest"
                    />
                </div>

                <div className="space-y-3">
                    <label htmlFor="password" className="text-metadata text-zinc-400 px-1">
                        Authorization Key
                    </label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        required
                        minLength={8}
                        placeholder="••••••••"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-sm px-5 py-4 text-sm font-bold text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 transition-all"
                    />
                    <p className="text-metadata text-zinc-500 normal-case px-1">
                        Security requirement: 8+ characters.
                    </p>
                </div>

                <button
                    type="submit"
                    className="primary-cta w-full mt-6"
                >
                    Initialize Account
                </button>
            </form>

            <div className="mt-10 pt-8 border-t border-zinc-800 text-center px-4">
                <p className="text-metadata text-zinc-500 normal-case">
                    Existing registry detected? {' '}
                    <Link href="/login" className="text-white hover:text-primary font-black transition-colors underline underline-offset-4 decoration-primary/30 uppercase tracking-widest">
                        Authorize Access
                    </Link>
                </p>
            </div>
        </div>
    );
}
