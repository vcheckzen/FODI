import { runtimeEnv } from '../types/env';

export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getAndSaveSkipToken(
  path: string,
  tokensToSave?: string[],
): Promise<string[]> {
  if (tokensToSave && tokensToSave.length === 0) {
    return tokensToSave;
  }

  path = path.toLocaleLowerCase();
  const skipTokenString = await runtimeEnv.FODI_CACHE.get('skip_token');
  const skipTokenData = skipTokenString ? JSON.parse(skipTokenString) : {};
  const currentTokens = skipTokenString ? skipTokenData[path]?.split(',') : [];

  const tokenChanged = tokensToSave && currentTokens.join(',') !== tokensToSave.join(',');
  if (tokenChanged) {
    skipTokenData[path] = tokensToSave.join(',');
    await runtimeEnv.FODI_CACHE.put('skip_token', JSON.stringify(skipTokenData));
  }

  return currentTokens;
}
