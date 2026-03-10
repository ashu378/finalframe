/**
 * FinalFrame — Terms of Service Page
 */

export const metadata = {
    title: 'Terms of Service',
    description: 'FinalFrame Terms of Service',
};

export default function TermsPage() {
    return (
        <div className="legal-document-container">
            <h1 className="public-heading-section mb-2 text-center">Terms of Service</h1>
            <p className="text-metadata text-center mb-16">Last updated: January 1, 2026</p>

            <div className="legal-text-block">
                <p>
                    Please read these Terms of Service carefully before using FinalFrame.
                    By using our service, you agree to be bound by these terms.
                    We prioritize deterministic control and rights-cleared commerce in all operations.
                </p>

                <div className="p-8 rounded-sm bg-primary/5 border border-primary/20 text-center text-xs text-primary font-black uppercase tracking-widest italic">
                    [Legal Operating Protocol is currently in synthesis. Full documentation available upon private beta authorization.]
                </div>
            </div>
        </div>
    );
}
