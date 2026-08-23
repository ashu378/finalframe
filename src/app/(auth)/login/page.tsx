import { LoginForm } from '@/lib/auth/forms';

export const metadata = { title: 'Log in', description: 'Log in to your FinalFrame studio.' };

export default function LoginPage() {
  return <LoginForm />;
}
