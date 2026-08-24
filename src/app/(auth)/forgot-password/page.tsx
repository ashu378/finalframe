import { ForgotPasswordForm } from '@/lib/auth/forms';

export const metadata = { title: 'Reset your password', description: 'Reset your FinalFrame password.' };
export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm emailEnabled={process.env.CONVEX_AUTH_EMAIL_ENABLED === 'true'} />;
}
