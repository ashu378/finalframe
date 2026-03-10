/**
 * FinalFrame — Pricing Page
 * Reference: MASTER_PRD.md § 5.I — Public Website Pricing
 * Reference: MASTER_PRD.md § 12 — Billing & Credits
 */

import Link from 'next/link';
import { Check } from 'lucide-react';

export const metadata = {
    title: 'Pricing',
    description: 'Choose the right plan for your video production needs.',
};

const plans = [
    {
        name: 'Free',
        price: '$0',
        period: 'forever',
        description: 'Perfect for trying out FinalFrame',
        features: [
            'Limited renders per month',
            'Basic quality output',
            'Standard support',
        ],
        cta: 'Get Started',
        href: '/signup',
        highlighted: false,
    },
    {
        name: 'Pro',
        price: '$49',
        period: 'per month',
        description: 'For serious creators and marketers',
        features: [
            'Unlimited renders',
            'HD quality output',
            'Priority support',
            'Advanced AI features',
        ],
        cta: 'Start Pro Trial',
        href: '/signup?plan=pro',
        highlighted: true,
    },
    {
        name: 'Agency',
        price: '$199',
        period: 'per month',
        description: 'For teams and agencies',
        features: [
            'Everything in Pro',
            '4K quality output',
            'Team collaboration',
            'White-label exports',
            'Dedicated support',
        ],
        cta: 'Contact Sales',
        href: '/contact',
        highlighted: false,
    },
];

export default function PricingPage() {
    return (
        <div className="min-h-screen pt-40 pb-20 px-6 font-sans bg-background selection:bg-primary/20">

            {/* Hero Section */}
            <section className="max-w-4xl mx-auto text-center mb-24">
                <h1 className="public-heading-section mb-6">Pricing Plans</h1>
                <p className="text-metadata text-primary">
                    Select authorization tier for production scale.
                </p>
            </section>

            {/* Plans Grid */}
            <section className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                {/* Background Glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-primary/5 blur-[120px] rounded-full pointer-events-none -z-10" />

                {plans.map((plan) => (
                    <div
                        key={plan.name}
                        className={`pricing-card relative flex flex-col ${plan.highlighted ? 'ring-2 ring-primary/50 shadow-2xl shadow-primary/10' : ''}`}
                    >
                        {/* Status Grid Detail */}
                        <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-1000">
                            <div className="w-20 h-20 border border-primary rotate-12" />
                        </div>

                        {plan.highlighted && (
                            <div className="absolute -top-px left-1/2 -translate-x-1/2 px-6 py-1 bg-primary text-black text-[10px] font-black uppercase tracking-[0.3em] shadow-lg shadow-primary/20 italic">
                                Recommended Protocol
                            </div>
                        )}

                        <h2 className="text-lg font-black text-zinc-50 mb-4 uppercase tracking-[0.2em] italic">{plan.name}</h2>
                        <div className="flex items-baseline gap-2 mb-8">
                            <span className="text-5xl font-black text-white tracking-tight">{plan.price}</span>
                            <span className="text-metadata italic">/{plan.period}</span>
                        </div>
                        <p className="text-sm font-medium text-zinc-400 mb-10 min-h-[48px] leading-relaxed">
                            {plan.description}
                        </p>

                        <ul className="space-y-4 mb-12 flex-1">
                            {plan.features.map((feature) => (
                                <li key={feature} className="flex items-center gap-4 text-xs font-bold text-zinc-300 uppercase tracking-widest">
                                    <Check className={`w-4 h-4 ${plan.highlighted ? 'text-primary' : 'text-zinc-600'}`} />
                                    {feature}
                                </li>
                            ))}
                        </ul>

                        <Link
                            href={plan.href}
                            className={`primary-cta w-full ${!plan.highlighted ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : ''}`}
                        >
                            Select Plan
                        </Link>
                    </div>
                ))}
            </section>
            {/* Governance Section */}
            <section className="max-w-4xl mx-auto mt-40 pt-40 border-t border-white/5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-24 items-center">
                    <div>
                        <h2 className="text-[12px] font-black text-primary uppercase tracking-[0.4em] mb-8 italic">Governance_&_Compliance</h2>
                        <h3 className="text-4xl font-black tracking-tight text-white uppercase italic mb-8">Built_for_Enterprise_Standards.</h3>
                        <p className="text-[14px] font-bold text-zinc-400 uppercase leading-relaxed tracking-wide mb-12">
                            Our architecture is designed for studios that require total control over their data
                            and intellectual property. FinalFrame ensures hardware-level isolation and
                            deterministic audit logs for every production cycle.
                        </p>
                    </div>
                    <div className="space-y-8">
                        {[
                            'Full_IP_Ownership',
                            'No_Training_on_Private_Data',
                            'Deterministic_Audit_Logs',
                            'SSO_&_SAML_Integration',
                            'Dedicated_Render_Nodes'
                        ].map((item) => (
                            <div key={item} className="flex items-center gap-6 group">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                <span className="text-[11px] font-black text-white uppercase tracking-[0.3em] group-hover:text-primary transition-colors cursor-default">{item}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
