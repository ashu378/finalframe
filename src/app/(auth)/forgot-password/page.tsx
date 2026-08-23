import { ForgotPasswordForm } from '@/lib/auth/forms';

export const metadata = { title: 'Reset your password', description: 'Reset your FinalFrame password.' };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
