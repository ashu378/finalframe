/**
 * FinalFrame — Cookie Policy Page
 * Reference: MASTER_PRD.md § 5.I — Legal: Cookies
 */

export const metadata = {
    title: 'Cookie Policy',
    description: 'FinalFrame Cookie Policy',
};

export default function CookiesPage() {
    return (
        <div className="legal-document-container">
            <h1 className="public-heading-section mb-2 text-center">Cookie Policy</h1>
            <p className="text-metadata text-center mb-16">Last updated: January 1, 2026</p>

            <div className="legal-text-block">
                <p>
                    This Cookie Policy explains how FinalFrame uses cookies and similar technologies.
                    Our technical stack uses cookies primarily for studio session integrity and registry authorization.
                </p>

                <div className="p-8 rounded-sm bg-primary/5 border border-primary/20 text-center text-xs text-primary font-black uppercase tracking-widest italic">
                    [Cookie Governance Protocol is currently in synthesis. Full documentation available upon private beta authorization.]
                </div>
            </div>
        </div>
    );
}
