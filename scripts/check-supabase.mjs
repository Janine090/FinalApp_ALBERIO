import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promises as dns } from 'node:dns';

function loadEnv(path) {
  const env = {};
  let raw = '';
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return env;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }
  return env;
}

function mask(value) {
  if (!value) return '(missing)';
  if (value.length <= 12) return `${value.slice(0, 4)}...`;
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`OK    ${message}`);
}

const env = loadEnv(resolve(process.cwd(), '.env'));
const url = env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

console.log('QR-ATT Supabase connection check');
console.log(`URL     ${url || '(missing)'}`);
console.log(`Key     ${mask(key)}`);
console.log('');

if (!url) fail('EXPO_PUBLIC_SUPABASE_URL is missing from .env');
if (!key) fail('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing from .env');

if (key.startsWith('sb_secret_')) {
  fail('The .env key is a secret/server key. Use the publishable (anon) key only.');
}
if (!key.startsWith('sb_publishable_') && !key.startsWith('eyJ')) {
  fail('The .env key is not a publishable/anon key.');
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  fail('The Project URL is not a valid URL.');
}

if (parsed) {
  if (parsed.protocol !== 'https:') fail('The Project URL must use https://');
  if (
    parsed.hostname.includes('your-project-id') ||
    parsed.hostname.includes('xxx.supabase.co')
  ) {
    fail('The Project URL is still a placeholder.');
  }

  console.log(`Host    ${parsed.hostname}`);
  console.log('');

  let dnsOk = false;
  try {
    const addresses = await dns.resolve4(parsed.hostname);
    dnsOk = true;
    ok(`DNS resolves (${addresses.join(', ')})`);
  } catch (error) {
    fail(
      `DNS lookup failed for ${parsed.hostname} (${error.code ?? error.message}). ` +
        'The project URL is wrong or the project was deleted/paused.'
    );
  }

  if (dnsOk) {
    const headers = { apikey: key };
    try {
      const response = await fetch(`${parsed.origin}/auth/v1/health`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        ok(`Auth service reachable (HTTP ${response.status})`);
      } else {
        fail(`Auth service returned HTTP ${response.status}`);
      }
    } catch (error) {
      fail(`Cannot reach the Auth service (${error.message})`);
    }

    try {
      const response = await fetch(`${parsed.origin}/auth/v1/settings`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        ok('Publishable/anon key is accepted by this project');
      } else {
        fail(
          `Key/project mismatch or invalid key (HTTP ${response.status}). ` +
            'Copy the key from the same project as the Project URL.'
        );
      }
    } catch (error) {
      fail(`Cannot verify the API key (${error.message})`);
    }

    try {
      const response = await fetch(
        `${parsed.origin}/rest/v1/profiles?select=id&limit=1`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
          },
          signal: AbortSignal.timeout(15000),
        }
      );
      if (response.ok) {
        ok('profiles table is reachable through the Data API');
      } else {
        const body = await response.text();
        fail(
          `profiles table check returned HTTP ${response.status}. ` +
            'Run supabase/fix-auth-profiles.sql in the SQL Editor. ' +
            body.slice(0, 300)
        );
      }
    } catch (error) {
      fail(`Cannot reach the profiles table (${error.message})`);
    }
  }
}

console.log('');
if (process.exitCode) {
  console.log('Result: connection is NOT ready.');
} else {
  console.log('Result: Supabase connection is healthy.');
}
