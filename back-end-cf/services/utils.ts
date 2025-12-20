import { DriveItemCollection } from '../types/apiType';
import { runtimeEnv } from '../types/env';

export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getSaveDelta(
  path: string,
  dataToSave?: DriveItemCollection,
): Promise<DriveItemCollection | null> {
  path = path.toLocaleLowerCase();
  const dString = await runtimeEnv.FODI_CACHE.get(`delta_${path}`);
  const dData = dString ? (JSON.parse(dString) as DriveItemCollection) : null;

  if (dataToSave) {
    await runtimeEnv.FODI_CACHE.put(`delta_${path}`, JSON.stringify(dataToSave));
  }

  return dData;
}

export function secureEqual(input: string | undefined, expected: string | undefined): boolean {
  if (!expected) {
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const inputData = encoder.encode(input);
    const expectedData = encoder.encode(expected);
    return (
      inputData.byteLength === expectedData.byteLength &&
      // @ts-ignore
      crypto.subtle.timingSafeEqual(inputData, expectedData)
    );
  } catch (e) {
    return false;
  }
}

export async function hmacSha256(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const buffer = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function parseJson<T = unknown>(body: string): T | undefined {
  try {
    return JSON.parse(body) as T;
  } catch {
    return undefined;
  }
}
