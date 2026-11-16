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
                <p>This Privacy Policy describes how FinalFrame collects, uses, and shares information when you use the service.</p>
                <h2>What we collect</h2>
                <p>We may collect account details, project instructions, uploaded media, usage records, and support messages needed to provide and improve the service.</p>
                <h2>Owner review</h2>
                <p>This page is the current product-facing summary. The complete policy and any jurisdiction-specific language must be reviewed and approved by the FinalFrame owner or legal adviser before publication.</p>
            </div>
        </div>
    );
}
