import { downloadFile } from '../services/fileMethods';
import { parsePath } from '../services/pathUtils';
import { renderDeployHtml } from '../services/deployMethods';
import { authorizeActions } from '../services/authUtils';

export async function handleGetRequest(
  request: Request,
  env: Env,
  requestUrl: URL,
): Promise<Response> {
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
    isProxyRequest ? `/${env.PROTECTED.PROXY_KEYWORD}` : undefined,
  );

  if (!fileName) {
    return new Response('Bad Request', { status: 400 });
  } else if (fileName.toLowerCase() === env.PROTECTED.PASSWD_FILENAME.toLowerCase()) {
    return new Response('Access Denied', { status: 403 });
  } else if (
    !(
      await authorizeActions(['download'], {
        env,
        url: requestUrl,
        passwd: request.headers.get('Authorization') ?? '',
      })
    ).has('download')
  ) {
    return new Response('Access Denied', { status: 403 });
  }

  return downloadFile(
    filePath,
    isProxyRequest,
    requestUrl.searchParams.get('format'),
    request.headers,
  );
}
