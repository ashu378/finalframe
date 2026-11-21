/** Only authenticated application routes can be a post-login destination. */
export function authenticatedReturnPath(value: string | null | undefined): string {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return '/dashboard';
  try {
    const url = new URL(value, 'https://finalframe.invalid');
    if (!value.startsWith('/') || url.origin !== 'https://finalframe.invalid') return '/dashboard';
    if (!['/admin', '/dashboard'].some(root => url.pathname === root || url.pathname.startsWith(`${root}/`))) return '/dashboard';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/dashboard'; }
}
