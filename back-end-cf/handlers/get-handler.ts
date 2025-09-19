import { downloadFile } from '../services/fileMethods';
import { parsePath } from '../services/pathUtils';
import { renderDeployHtml } from '../services/deployMethods';

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

  if (fileName.toLowerCase() === env.PROTECTED.PASSWD_FILENAME.toLowerCase()) {
    return new Response('Access Denied', { status: 403 });
  }

  return downloadFile(
    filePath,
    isProxyRequest,
    requestUrl.searchParams.get('format'),
    request.headers,
  );
}
