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
    const lastAccessedTime = response?.headers.get('Last-Accessed') || 0;
    const cachedAccessedTime = new Date(lastAccessedTime).getTime();
    const isExpired = (Date.now() - cachedAccessedTime) / 1000 > CACHE_TTLMAP[requestMethod];
    const isforceRefresh =
      env.PASSWORD && cacheUrl.searchParams.get('forceRefresh') === (await sha256(env.PASSWORD));

    if (!response || isExpired || isforceRefresh) {
      response = await handleRequest(request, env);

      if ([200, 302].includes(response.status)) {
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('Last-Accessed', new Date().toUTCString());
        response = newResponse;
        ctx.waitUntil(cache.put(cacheKey, newResponse.clone()));
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
          ALLOW: 'COPY, DELETE, GET, HEAD, MKCOL, MOVE, OPTIONS, POST, PROPFIND, PUT',
          'ms-author-via': 'DAV',
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
