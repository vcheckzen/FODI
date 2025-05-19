import { Env, PROTECTED } from '../types';
import { sha256 } from '../services/utils';
import { handleWebdav } from './dav-handler';
import { downloadFile } from './file-handler';
import { handlePostRequest } from './post-handler';

export async function cacheRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const CACHE_TTLMAP = env.CACHE_TTLMAP;
  if (CACHE_TTLMAP[request.method]) {
    const keyGenerators: {
      [key: string]: () => string | Promise<string>;
    } = {
      GET: () => request.url.toLowerCase(),
      POST: async () => await request.clone().text(),
    };
    const cacheKeySource = await keyGenerators[request.method]();
    const hash = await sha256(cacheKeySource);
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = `/${request.method}` + cacheUrl.pathname + hash;
    const cacheKey = new Request(cacheUrl.toString(), {
      method: 'GET',
    });

    const cache = (caches as any).default;
    let response = await cache.match(cacheKey);
    const LastModified = response?.headers.get('Last-Modified') || 0;
    const cacheModifiedTime = new Date(LastModified).getTime();
    const isExpired = (Date.now() - cacheModifiedTime) / 1000 > CACHE_TTLMAP[request.method];

    if (!response || isExpired) {
      response = await handleRequest(request, env);

      if ([200, 302].includes(response.status)) {
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      }
    }

    return response;
  }
  return handleRequest(request, env);
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const requestUrl = new URL(request.url);
  const proxyDownload =
    requestUrl.searchParams.has(PROTECTED.PROXY_KEYWORD) ||
    requestUrl.pathname.startsWith(`/${PROTECTED.PROXY_KEYWORD}/`);
  const file =
    requestUrl.searchParams.get('file') ||
    decodeURIComponent(requestUrl.pathname.replace(`/${PROTECTED.PROXY_KEYWORD}/`, '/'));

  const handlers: {
    [key: string]: () => Promise<Response> | Response;
  } = {
    // Preflight
    OPTIONS: () => {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          DAV: '1, 3',
        },
      });
    },
    // Download a file
    GET: () => {
      const fileName = file.split('/').pop();
      if (!fileName) return new Response('Bad Request', { status: 400 });
      if (fileName.toLowerCase() === PROTECTED.PASSWD_FILENAME.toLowerCase()) {
        return new Response('Access Denied', { status: 403 });
      }
      return downloadFile(
        file,
        proxyDownload,
        requestUrl.searchParams.get('format'),
        request.headers.get('range'),
      );
    },
    // Upload and List files
    POST: () => handlePostRequest(request, env, requestUrl),
  };

  const handler = handlers[request.method];

  if (handler) {
    return handler();
  }

  const davMethods = ['COPY', 'DELETE', 'HEAD', 'MKCOL', 'MOVE', 'PROPFIND', 'PUT'];
  if (davMethods.includes(request.method) && env.WEBDAV) {
    return handleWebdav(file, request, env.WEBDAV);
  } else {
    return new Response('Method Not Allowed', { status: 405 });
  }
}
