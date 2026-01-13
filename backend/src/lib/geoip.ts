// backend/src/lib/geoip.ts
import fs from 'fs';
import path from 'path';
import { Reader } from '@maxmind/geoip2-node';

const DB_DIR = process.env.GEOIP_DB_DIR
  ? path.resolve(process.cwd(), process.env.GEOIP_DB_DIR)
  : path.resolve(process.cwd(), 'geoip');

function openIfExists(filename: string) {
  const p = path.join(DB_DIR, filename);
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  return Reader.openBuffer(buf); // keep as a singleton
}

// singletons
const cityReader = openIfExists('GeoLite2-City.mmdb');
const countryReader = openIfExists('GeoLite2-Country.mmdb');

function normalizeIp(ip: string) {
  if (!ip) return ip;
  if (ip === '::1') return '127.0.0.1';
  const m = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return m ? m[1] : ip;
}
function isPrivate(ip: string) {
  return ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.');
}

export function geoLookup(
  ipRaw: string
): { country?: string|null; region?: string|null; city?: string|null; lat?: number|null; lon?: number|null } | null {
  const ip = normalizeIp(ipRaw || '');
  if (!ip || isPrivate(ip)) return null;

  try {
    if (cityReader) {
      const res: any = (cityReader as any).city(ip);
      return {
        country: res?.country?.isoCode ?? null,
        region:  res?.subdivisions?.[0]?.names?.en ?? res?.subdivisions?.[0]?.isoCode ?? null,
        city:    res?.city?.names?.en ?? null,
        lat:     typeof res?.location?.latitude  === 'number' ? res.location.latitude  : null,
        lon:     typeof res?.location?.longitude === 'number' ? res.location.longitude : null,
      };
    }
  } catch { /* fall back */ }

  try {
    if (countryReader) {
      const res: any = (countryReader as any).country(ip);
      return { country: res?.country?.isoCode ?? null, region: null, city: null, lat: null, lon: null };
    }
  } catch {}

  return null;
}

export function geoDbReady() {
  return !!(cityReader || countryReader);
}
