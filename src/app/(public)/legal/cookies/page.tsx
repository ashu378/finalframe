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
                    FinalFrame uses cookies and similar storage where needed for secure sessions, account preferences, and reliable product operation.
                </p>

                <div className="p-8 rounded-sm bg-primary/5 border border-primary/20 text-center text-xs text-primary font-black uppercase tracking-widest italic">
                    This page is a product-facing summary. The complete cookie notice and consent language require owner or legal review before publication.
                </div>
            </div>
        </div>
    );
}
