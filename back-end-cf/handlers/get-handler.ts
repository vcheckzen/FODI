import { downloadFile } from '../services/fileMethods';
import { parsePath } from '../services/pathUtils';
import { renderDeployHtml } from '../services/deployMethods';
import { authenticateWebdav, secureEqual } from '../services/authUtils';
import { sha256 } from '../services/utils';

export async function handleGetRequest(
  request: Request,
  env: Env,
  requestUrl: URL,
): Promise<Response> {
  // display web
  if (requestUrl.pathname === '/' && env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  // display deployment
  if (requestUrl.pathname === '/deployfodi') {
    return renderDeployHtml(env, requestUrl);
  }

  // download files
  const isProxyRequest =
    env.PROTECTED.PROXY_KEYWORD &&
    requestUrl.pathname.startsWith(`/${env.PROTECTED.PROXY_KEYWORD}`);
  const { path: filePath, tail: fileName } = parsePath(
    requestUrl.searchParams.get('file') || decodeURIComponent(requestUrl.pathname),
    `/${env.PROTECTED.PROXY_KEYWORD}`,
  );

  if (!fileName) {
    return new Response('Bad Request', { status: 400 });
  }

  const isPwRight =
    authenticateWebdav(request.headers.get('Authorization'), env.USERNAME, env.PASSWORD) ||
    (env.PASSWORD &&
      secureEqual(requestUrl.searchParams.get('dpw')?.toLowerCase(), await sha256(env.PASSWORD)));

  const isAccessDenied =
    fileName.toLowerCase() === env.PROTECTED.PASSWD_FILENAME.toLowerCase() ||
    (filePath.split('/').length <= env.PROTECTED.PROTECTED_LAYERS && !isPwRight);
  if (isAccessDenied) {
    return new Response('Access Denied', { status: 403 });
  }

  return downloadFile(
    filePath,
    isProxyRequest,
    requestUrl.searchParams.get('format'),
    request.headers,
  );
}
