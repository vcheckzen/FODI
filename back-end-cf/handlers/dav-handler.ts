import { DavRes, runtimeEnv } from '../types/apiType';
import { authenticateWebdav } from '../services/authUtils';
import {
  handleCopyMove,
  handleDelete,
  handleHead,
  handleMkcol,
  handlePropfind,
  handlePut,
} from '../services/davMethods';
import { parsePath } from '../services/pathUtils';

export async function handleWebdav(request: Request, env: Env, requestUrl: URL): Promise<Response> {
  const isdavAuthorized = authenticateWebdav(request.headers.get('Authorization'), env.WEBDAV);
  if (!isdavAuthorized) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="WebDAV"' },
    });
  }

  const isProxyRequest =
    env.PROTECTED.PROXY_KEYWORD &&
    requestUrl.pathname.startsWith(`/${env.PROTECTED.PROXY_KEYWORD}`);
  const filePath = parsePath(
    decodeURIComponent(requestUrl.pathname),
    `/${env.PROTECTED.PROXY_KEYWORD}`,
    true,
  ).path;
  const destination = parsePath(
    decodeURIComponent(request.headers.get('Destination') || ''),
    `/${env.PROTECTED.PROXY_KEYWORD}`,
    true,
  ).path;

  const handlers: Record<string, () => Promise<DavRes> | DavRes> = {
    HEAD: () => handleHead(filePath),
    COPY: () => handleCopyMove(filePath, 'COPY', destination),
    MOVE: () => handleCopyMove(filePath, 'MOVE', destination),
    DELETE: () => handleDelete(filePath),
    MKCOL: () => handleMkcol(filePath),
    PUT: () => handlePut(filePath, request),
    PROPFIND: () => handlePropfind(filePath),
  };

  const handler = handlers[request.method];
  const davRes = handleDavRes(await handler(), isProxyRequest);

  return new Response(davRes.davXml, {
    status: davRes.davStatus,
    headers: davRes.davHeaders,
  });
}

function handleDavRes(davRes: DavRes, isProxyRequest: boolean) {
  const davHeaders = {
    ...(davRes.davXml ? { 'Content-Type': 'application/xml; charset=utf-8' } : {}),
    ...(davRes.davHeaders || {}),
  };

  const davXml =
    isProxyRequest && davRes.davXml
      ? davRes.davXml.replaceAll('<d:href>', `<d:href>/${runtimeEnv.PROTECTED.PROXY_KEYWORD}`)
      : davRes.davXml;

  return { davXml, davStatus: davRes.davStatus, davHeaders };
}
