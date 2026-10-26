export const OFFICIAL_HOSTS = [
  'legislation.gov.au', 'ato.gov.au', 'asic.gov.au', 'aph.gov.au', 'aasb.gov.au', 'treasury.gov.au',
  'gov.uk', 'parliament.uk', 'frc.org.uk', 'ifrs.org',
] as const;

/** Hostname of a URL, or the input itself when it does not parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** https, and the host equals an allowed host or ends with '.' + it. */
export function isOfficialUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname;
  return OFFICIAL_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}
