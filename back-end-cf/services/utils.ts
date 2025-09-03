import {
  AccessTokenResponse,
  BatchReqPayload,
  BatchRespData,
  runtimeEnv,
  TokenResponse,
} from '../types/apiType';

export async function fetchToken(
  envOauth: Env['OAUTH'],
  params: Record<string, string>,
): Promise<TokenResponse> {
  const tokenEndpoint = `${envOauth.oauthUrl}token`;
  const body = new URLSearchParams({
    client_id: envOauth.clientId,
    client_secret: envOauth.clientSecret,
    redirect_uri: envOauth.redirectUri,
    ...params,
  });

  const resp = await fetch(tokenEndpoint, {
    method: 'POST',
    body,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Token request failed: ${errText}`);
  }

  return (await resp.json()) as TokenResponse;
}

export async function fetchAccessToken(
  envOauth: Env['OAUTH'],
  envFodi?: Env['FODI_CACHE'],
): Promise<string> {
  if (!envFodi) {
    throw new Error('KV is not available');
  }

  let refreshToken = '';
  const tokenData = await envFodi.get('token_data');
  const cache = tokenData ? JSON.parse(tokenData) : null;
  if (cache?.refresh_token) {
    const passedMilis = Date.now() - cache.save_time;
    if (passedMilis / 1000 < cache.expires_in - 600) {
      return cache.access_token;
    }

    if (passedMilis < 6912000000) {
      refreshToken = cache.refresh_token;
    }
  }

  const result = await fetchToken(envOauth, {
    grant_type: 'refresh_token',
    requested_token_use: 'on_behalf_of',
    refresh_token: refreshToken,
  });
  if (result?.refresh_token) {
    (result as AccessTokenResponse).save_time = Date.now();
    await envFodi.put('token_data', JSON.stringify(result));
  }

  return result.access_token;
}

export async function fetchWithAuth(uri: string, options: RequestInit = {}) {
  const accessToken = await fetchAccessToken(runtimeEnv.OAUTH, runtimeEnv.FODI_CACHE);
  return fetch(uri, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...((options.headers as Record<string, string>) || {}),
    },
  });
}

export async function fetchBatchRes(batch: BatchReqPayload): Promise<BatchRespData> {
  const batchResponse = await fetchWithAuth(`${runtimeEnv.OAUTH.apiHost}/v1.0/$batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });
  return batchResponse.json();
}

export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function fetchSaveSkipToken(path: string, tokensToSave?: string[]): Promise<string[]> {
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
