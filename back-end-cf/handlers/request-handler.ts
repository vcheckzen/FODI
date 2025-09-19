import { sha256 } from '../services/utils';
import { handleWebdav } from './dav-handler';
import { handleGetRequest } from './get-handler';
import { handlePostRequest } from './post-handler';

export async function cacheRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const CACHE_TTLMAP = env.PROTECTED.CACHE_TTLMAP;
  const requestMethod = request.method as keyof typeof CACHE_TTLMAP;
  if (CACHE_TTLMAP[requestMethod]) {
    const keyGenerators: {
      [key: string]: () => string | Promise<string>;
    } = {
      GET: () => request.url.toLowerCase(),
      POST: async () => await request.clone().text(),
    };
    const cacheKeySource = await keyGenerators[requestMethod]();
    const hash = await sha256(cacheKeySource);
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = `/${requestMethod}` + cacheUrl.pathname + hash;
    const cacheKey = new Request(cacheUrl.toString(), {
      method: 'GET',
    });

    const cache = (caches as any).default;
    let response = await cache.match(cacheKey);
    const LastModified = response?.headers.get('Last-Modified') || 0;
    const cacheModifiedTime = new Date(LastModified).getTime();
    const isExpired = (Date.now() - cacheModifiedTime) / 1000 > CACHE_TTLMAP[requestMethod];

    if (!response || isExpired) {
      response = await handleRequest(request, env);

      if ([200, 302].includes(response.status)) {
        const modResponse = new Response(response.body, response);
        modResponse.headers.set('Last-Modified', new Date().toUTCString());
        response = modResponse;
        ctx.waitUntil(cache.put(cacheKey, modResponse.clone()));
      }
    }

    return response;
  }
  return handleRequest(request, env);
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const requestUrl = new URL(request.url);

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
    // Download a file or display web
    GET: () => handleGetRequest(request, env, requestUrl),
    // Upload or List files
    POST: () => handlePostRequest(request, env, requestUrl),
  };

  const handler = handlers[request.method];
  if (handler) {
    return handler();
  }

  const davMethods = ['COPY', 'DELETE', 'HEAD', 'MKCOL', 'MOVE', 'PROPFIND', 'PUT'];
  if (davMethods.includes(request.method)) {
    return handleWebdav(request, env, requestUrl);
  }

  return new Response(null, { status: 405 });
}
