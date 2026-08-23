import { ResetPasswordForm } from '@/lib/auth/forms';

export const metadata = { title: 'Choose a new password', description: 'Set a new FinalFrame password.' };

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
