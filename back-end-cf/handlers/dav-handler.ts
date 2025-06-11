import { DavRes, PROTECTED } from '../types/apiType';
import { authenticateWebdav } from '../services/auth';
import {
  handleCopyMove,
  handleDelete,
  handleHead,
  handleMkcol,
  handlePropfind,
  handlePut,
} from '../services/davMethod';

export async function handleWebdav(
  filePath: string,
  request: Request,
  davCredentials: string | undefined,
): Promise<Response> {
  const davAuth = authenticateWebdav(request.headers.get('Authorization'), davCredentials);
  if (!davAuth) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="WebDAV"',
      },
    });
  }

  const handlers: {
    [key: string]: () => Promise<DavRes> | DavRes;
  } = {
    HEAD: () => handleHead(filePath),
    COPY: () => handleCopyMove(filePath, 'COPY', request.headers.get('Destination')),
    MOVE: () => handleCopyMove(filePath, 'MOVE', request.headers.get('Destination')),
    DELETE: () => handleDelete(filePath),
    MKCOL: () => handleMkcol(filePath),
    PUT: () => handlePut(filePath, request),
    PROPFIND: () => handlePropfind(filePath),
  };
  const handler = handlers[request.method];
  const davRes = handleDavRes(await handler(), request);

  return new Response(davRes.davXml, {
    status: davRes.davStatus,
    headers: davRes.davHeaders,
  });
}

function handleDavRes(davRes: DavRes, request: Request) {
  const davHeaders = {
    ...(davRes.davXml ? { 'Content-Type': 'application/xml; charset=utf-8' } : {}),
    ...(davRes.davHeaders || {}),
  };

  const proxyDownload = new URL(request.url).pathname.startsWith(`/${PROTECTED.PROXY_KEYWORD}`);
  const davXml =
    proxyDownload && davRes.davXml
      ? davRes.davXml.replaceAll('<d:href>', `<d:href>/${PROTECTED.PROXY_KEYWORD}`)
      : davRes.davXml;

  const davStatus = davRes.davStatus;

  return { davXml, davStatus, davHeaders };
}
