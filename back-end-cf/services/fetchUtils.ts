import type { BatchReqPayload, BatchRespData, TokenResponse } from '../types/apiType';
import { runtimeEnv } from '../types/env';

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
    (result as TokenResponse).save_time = Date.now();
    await envFodi.put('token_data', JSON.stringify(result));
  }

  return result.access_token;
}

export async function fetchWithAuth(uri: string, options: RequestInit = {}) {
  const accessToken = await fetchAccessToken(runtimeEnv.OAUTH, runtimeEnv.FODI_CACHE);
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);

  return fetch(uri, {
    ...options,
    headers,
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
