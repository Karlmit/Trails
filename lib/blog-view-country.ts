import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Reader, type CountryResponse } from 'mmdb-lib';

const countryNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
const defaultDatabasePath = '/app/user-country.mmdb';
let database: Promise<Reader<CountryResponse> | null> | undefined;

function getHeader(headers: Headers, name?: string) {
  return name && /^[\w-]+$/.test(name) ? headers.get(name)?.trim() : undefined;
}

function countryCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const code = value.toUpperCase();
  if (code === 'UK') return 'GB';
  if (/^(?:EU|EZ|QO|UN|ZZ)$/.test(code)) return;
  if (/^[A-Z]{2}$/.test(code) && countryNames.of(code)) return code;
}

export async function readerCountry(headers: Headers): Promise<string> {
  const proxyCountry = countryCode(getHeader(headers, process.env.BLOG_VIEW_COUNTRY_HEADER?.trim()));
  if (proxyCountry) return proxyCountry;

  // Use one address from a header the last proxy overwrites. Forwarded-for
  // lists can also contain values supplied by the reader.
  const ipHeader = process.env.BLOG_VIEW_IP_HEADER?.trim() || 'X-Real-IP';
  const address = ipHeader.toLowerCase() === 'off' ? null : getHeader(headers, ipHeader);
  if (!address || !isIP(address) || address.includes('%')) return 'ZZ';
  const ip = ipaddr.process(address);
  if (ip.range() !== 'unicast') return 'ZZ';

  database ??= readFile(process.env.BLOG_VIEW_COUNTRY_DB?.trim() || defaultDatabasePath)
    .then((data) => new Reader<CountryResponse>(data))
    .catch(() => {
      console.warn('Blog view country database unavailable');
      return null;
    });
  try {
    const result = (await database)?.get(ip.toString());
    return countryCode(result?.country?.iso_code) ?? 'ZZ';
  } catch {
    // A broken lookup must not prevent the view itself from being counted.
    return 'ZZ';
  }
}
