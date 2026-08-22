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
                <p>Please read these Terms of Service carefully before using FinalFrame. By using the service, you agree to follow the rules that apply to your account, projects, uploaded media, credits, and exports.</p>
                <h2>Your media and responsibility</h2>
                <p>You are responsible for having the rights and permissions needed for the instructions, footage, images, audio, logos, and other media you provide.</p>
                <h2>Owner review</h2>
                <p>This page is a current product-facing summary. Complete terms, payment terms, limitations, and jurisdiction-specific language require review and approval by the FinalFrame owner or legal adviser before publication.</p>
            </div>
        </div>
    );
}
