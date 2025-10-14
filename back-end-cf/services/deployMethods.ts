import type { TokenResponse } from '../types/apiType';
import { fetchToken } from './fetchUtils';

export async function renderDeployHtml(env: Env, requestUrl: URL) {
  if (!env.FODI_CACHE) {
    throw new Error('KV is not available');
  }

  const tokenData = await env.FODI_CACHE.get('token_data');
  if (tokenData) {
    return Response.redirect(requestUrl.origin);
  }

  const authUrl = [
    env.OAUTH.oauthUrl,
    'authorize',
    `?client_id=${env.OAUTH.clientId}`,
    `&scope=${encodeURIComponent(env.OAUTH.scope)}`,
    '&response_type=code',
    `&redirect_uri=${env.OAUTH.redirectUri}`,
  ].join('');
  const returnHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Authorization</title>
</head>
<body style="font-family: sans-serif; padding: 20px;">
  <h2>OneDrive 授权</h2>
  <p>
    <a href="${authUrl}" target="_blank">
      <button style="padding:8px 16px;">点击跳转授权</button>
    </a>
  </p>
  <p>授权成功后，浏览器会跳转到新网址，请复制完整地址并粘贴到下方表单。</p>
  <form action="/deployreturn" method="post">
    <label for="codeUrl">浏览器跳转地址：</label><br>
    <input type="text" id="codeUrl" name="codeUrl" style="width:100%;padding:8px;margin:8px 0;" required />
    <br>
    <button type="submit" style="padding:8px 16px;">提交</button>
  </form>
</body>
</html>
`;

  return new Response(returnHtml, { headers: { 'Content-Type': 'text/html' } });
}

export async function saveDeployData(env: Env, requestUrl: URL, codeUrl: string) {
  if (!env.FODI_CACHE) {
    throw new Error('KV is not available');
  }

  const tokenData = await env.FODI_CACHE.get('token_data');
  if (tokenData) {
    return Response.redirect(requestUrl.origin);
  }

  const urlObj = new URL(codeUrl);
  const code = urlObj.searchParams.get('code');
  if (!code) {
    return new Response('Missing Code Parameter', { status: 400 });
  }

  const result = await fetchToken(env.OAUTH, {
    grant_type: 'authorization_code',
    code,
  });
  (result as TokenResponse).save_time = Date.now();
  await env.FODI_CACHE.put('token_data', JSON.stringify(result));

  return Response.redirect(requestUrl.origin);
}
