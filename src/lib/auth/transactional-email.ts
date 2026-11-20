const EMAIL_ENDPOINTS = new Set([
  'https://api.zeptomail.com/v1.1/email',
  'https://cpaas.zoho.com/v1.1/email',
]);

export function emailConfiguration(env: Record<string, string | undefined>) {
  const token = env.CONVEX_AUTH_ZEPTOMAIL_TOKEN?.trim().replace(/^Zoho-enczapikey\s+/i, '');
  const from = env.CONVEX_AUTH_FROM_EMAIL?.trim();
  const endpoint = env.CONVEX_AUTH_EMAIL_API_URL?.trim() || 'https://api.zeptomail.com/v1.1/email';
  if (!token || /\s/.test(token) || !from || !EMAIL_ENDPOINTS.has(endpoint)) {
    throw new Error('Email delivery is not configured.');
  }
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const sender = match ? { name: match[1] || 'FinalFrame', address: match[2] } : { name: 'FinalFrame', address: from };
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender.address)) throw new Error('Email sender is not configured.');
  return { token, sender, endpoint };
}

/** Server only. Never log credentials, authentication codes or provider response bodies. */
export async function sendTransactionalEmail(
  message: { to: string; subject: string; html: string; text: string },
  env: Record<string, string | undefined> = process.env,
  transport: typeof fetch = fetch,
) {
  const { token, sender, endpoint } = emailConfiguration(env);
  try {
    const response = await transport(endpoint, {
      method: 'POST',
      headers: { Authorization: `Zoho-enczapikey ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender,
        to: [{ email_address: { address: message.to } }],
        subject: message.subject,
        htmlbody: message.html,
        textbody: message.text,
        track_opens: false,
        track_clicks: false,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('Email provider rejected delivery.');
  } catch {
    throw new Error("We couldn't send the authentication email. Please try again.");
  }
}
