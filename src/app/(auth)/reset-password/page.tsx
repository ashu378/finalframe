/**
 * FinalFrame — Reset Password Page
 */

import Link from 'next/link';
import { updatePassword } from '@/lib/auth/actions';

export const metadata = {
    title: 'Reset Password',
    description: 'Set a new password for your FinalFrame account',
};

export default function ResetPasswordPage() {
    return (
        <div className="w-full max-w-sm mx-auto glass-card p-8 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-2">Set new password</h1>
                <p className="text-sm text-slate-400">Choose a strong password for your account</p>
            </div>

            <form action={updatePassword} className="space-y-6">
                <div className="space-y-2">
                    <label htmlFor="password" className="text-sm font-medium text-slate-200 block ml-1">
                        New Password
                    </label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        required
                        placeholder="••••••••"
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all hover:bg-white/10"
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-200 block ml-1">
                        Confirm Password
                    </label>
                    <input
                        type="password"
                        id="confirmPassword"
                        name="confirmPassword"
                        required
                        placeholder="••••••••"
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all hover:bg-white/10"
                    />
                </div>

                <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold shadow-[0_0_20px_-5px_rgba(124,58,237,0.5)] hover:shadow-[0_0_25px_-5px_rgba(124,58,237,0.7)] hover:brightness-110 active:scale-[0.98] transition-all"
                >
                    Update Password
                </button>
            </form>

            <p className="mt-8 text-center text-sm text-slate-400">
                <Link href="/login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors hover:underline">
                    Back to Login
                </Link>
            </p>
        </div>
    );
}
