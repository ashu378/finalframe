export const EMAIL_CODE_TTL_SECONDS = 600;
export const EMAIL_RESEND_SECONDS = 60;
export const EMAIL_SENDS_PER_HOUR = 5;

export function normalizeAuthEmail(value: unknown) {
  if (typeof value !== 'string') throw new Error('Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) throw new Error('Enter a valid email address.');
  return email;
}

export function emailEnabledFor(email: string, env: Record<string, string | undefined>) {
  return env.CONVEX_AUTH_EMAIL_ENABLED === 'true' || (env.CONVEX_AUTH_EMAIL_TEST_ALLOWLIST || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean).includes(email);
}

export function sixDigitCode() {
  const values = new Uint32Array(1);
  // Rejection sampling avoids modulo bias.
  do { crypto.getRandomValues(values); } while (values[0] >= 4_294_000_000);
  return String(values[0] % 1_000_000).padStart(6, '0');
}

export function checkSendLimit(state: { count: number; windowStart: number; lastSentAt: number } | null, now: number, global = false) {
  if (!state) return { count: 1, windowStart: now, lastSentAt: now };
  if (!global && now - state.lastSentAt < EMAIL_RESEND_SECONDS * 1000) throw new Error('Please wait a minute before requesting another code.');
  const count = now - state.windowStart >= 3_600_000 ? 0 : state.count;
  if (count >= (global ? 100 : EMAIL_SENDS_PER_HOUR)) throw new Error('Too many email requests. Please try again later.');
  return { count: count + 1, windowStart: count ? state.windowStart : now, lastSentAt: now };
}

export function authEmailMessage(purpose: 'verify' | 'reset', email: string, code: string, siteUrl: string) {
  const site = new URL(siteUrl);
  if (site.protocol !== 'https:' || site.username || site.password) throw new Error('Authentication website is not configured.');
  const link = new URL(purpose === 'reset' ? '/reset-password' : '/verify-email', site.origin);
  link.searchParams.set('email', email);
  const subject = purpose === 'reset' ? 'Reset your FinalFrame password' : 'Verify your FinalFrame email';
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  return {
    to: email, subject,
    text: `${subject}\n\nYour code is: ${code}\n\nIt expires in 10 minutes and can be used once. Enter it at ${link.href}\n\nIf you did not request this, ignore this email. Your password has not changed.`,
    html: `<h1>${subject}</h1><p>Your code is:</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold">${escape(code)}</p><p>It expires in 10 minutes and can be used once.</p><p><a href="${escape(link.href)}">${purpose === 'reset' ? 'Choose a new password' : 'Verify your email'}</a></p><p>If you did not request this, ignore this email. Your password has not changed.</p>`,
  };
}
