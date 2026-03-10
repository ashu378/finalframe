/**
 * FinalFrame — Privacy Policy Page
 */

export const metadata = {
    title: 'Privacy Policy',
    description: 'FinalFrame Privacy Policy',
};

export default function PrivacyPage() {
    return (
        <div className="legal-document-container">
            <h1 className="public-heading-section mb-2 text-center">Privacy Policy</h1>
            <p className="text-metadata text-center mb-16">Last updated: January 1, 2026</p>

            <div className="legal-text-block">
                <p>
                    This Privacy Policy describes how FinalFrame collects, uses, and shares your information.
                    Our commitment to your data security is as mechanical and precise as our render engine.
                </p>

                <div className="p-8 rounded-sm bg-primary/5 border border-primary/20 text-center text-xs text-primary font-black uppercase tracking-widest italic">
                    [Comprehensive Legal Manifest is currently in synthesis. Full documentation available upon private beta authorization.]
                </div>
            </div>
        </div>
    );
}
