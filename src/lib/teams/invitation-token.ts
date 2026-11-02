export async function invitationSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return { token, tokenHash: Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('') };
}
