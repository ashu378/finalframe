/**
 * FinalFrame — GDPR / DPA Page
 * Reference: MASTER_PRD.md § 5.I — Legal: GDPR / DPA
 */

export const metadata = {
    title: 'GDPR / DPA',
    description: 'FinalFrame GDPR and Data Processing Agreement',
};

export default function GdprPage() {
    return (
        <div className="legal-document-container">
            <h1 className="public-heading-section mb-2 text-center">GDPR / DPA</h1>
            <p className="text-metadata text-center mb-16">Last updated: January 1, 2026</p>

            <div className="legal-text-block">
                <p>
                    This page outlines FinalFrame's compliance with GDPR and our Data Processing Agreement.
                    Data sovereignty is a core directive of our production architecture.
                </p>

                <div className="p-8 rounded-sm bg-primary/5 border border-primary/20 text-center text-xs text-primary font-black uppercase tracking-widest italic">
                    [GDPR Compliance Manifest is currently in synthesis. Full documentation available upon private beta authorization.]
                </div>
            </div>
        </div>
    );
}
