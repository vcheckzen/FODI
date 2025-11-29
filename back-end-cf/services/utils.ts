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
