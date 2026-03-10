/**
 * FinalFrame — Forgot Password Page
 * Reference: MASTER_PRD.md § 5.I — Forgot Password modal (implemented as page)
 */

import Link from 'next/link';
import { requestPasswordReset } from '@/lib/auth/actions';

export const metadata = {
    title: 'Forgot Password',
    description: 'Reset your FinalFrame password',
};

export default function ForgotPasswordPage() {
    return (
        <div className="w-full max-w-sm mx-auto bg-zinc-900 border border-zinc-800 p-10 shadow-2xl relative overflow-hidden group animate-in fade-in zoom-in-95 duration-500">
            <div className="absolute top-0 right-0 p-10 opacity-[0.02] group-hover:opacity-5 transition-opacity duration-1000">
                <div className="w-32 h-32 border-2 border-primary rotate-12" />
            </div>
            <div className="text-center mb-10 relative z-10">
                <h1 className="text-lg font-black uppercase tracking-[0.3em] mb-4 text-zinc-50 italic">Key Recovery</h1>
                <p className="text-metadata text-zinc-400 mt-6">Input Access ID to initiate recovery sequence.</p>
            </div>

            <form action={requestPasswordReset} className="space-y-6">
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

                <button
                    type="submit"
                    className="primary-cta w-full mt-6"
                >
                    Transmit Recovery Link
                </button>
            </form>

            <div className="mt-10 pt-8 border-t border-zinc-800 text-center">
                <p className="text-metadata text-zinc-500 normal-case px-4">
                    Key remembered? {' '}
                    <Link href="/login" className="text-white hover:text-primary font-black transition-colors underline underline-offset-4 decoration-primary/30 uppercase tracking-widest">
                        Authorize Access
                    </Link>
                </p>
            </div>
        </div>
    );
}
