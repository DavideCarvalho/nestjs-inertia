/**
 * Validates a redirect URL to prevent open-redirect attacks.
 * Only relative URLs (starting with `/`) or same-origin absolute URLs are
 * permitted. Absolute URLs to other hosts throw an error.
 */
export function validateLocationUrl(url: string): string {
  // Relative URLs starting with a single / are safe
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  // Reject protocol-relative URLs (//evil.com/path)
  if (url.startsWith('//')) {
    throw new Error(`[nestjs-inertia] location() rejected protocol-relative URL: ${url}`);
  }
  // Attempt to parse as absolute URL
  try {
    const parsed = new URL(url);
    // Allow only http/https schemes (no javascript: etc.)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`[nestjs-inertia] location() rejected unsafe URL scheme: ${url}`);
    }
    // Same-origin check: if called on the server, we don't have the request origin,
    // so we reject all absolute URLs to external hosts.
    throw new Error(
      `[nestjs-inertia] location() rejected absolute URL to external host: ${url}. Use a relative path (e.g. "/dashboard") instead.`,
    );
  } catch (err) {
    if (err instanceof TypeError) {
      // Not a valid absolute URL — only allow paths that look like relative URLs
      if (/^[a-zA-Z0-9]/.test(url) || url.startsWith('.')) {
        return url;
      }
      throw new Error(`[nestjs-inertia] location() rejected unrecognized URL format: ${url}`);
    }
    throw err;
  }
}
