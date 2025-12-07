import { sha256 } from '../services/utils';
import { handleWebdav } from './dav-handler';
import { handleGetRequest } from './get-handler';
import { handlePostRequest } from './post-handler';
import { authenticateToken } from '../services/authUtils';

export async function cacheRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const CACHE_TTLMAP = env.CACHE_TTLMAP;
  const method = request.method as keyof typeof CACHE_TTLMAP;
  const cacheTTL = CACHE_TTLMAP[method];

  if (!cacheTTL || cacheTTL <= 0) {
    return handleRequest(request, env);
  }

  // WebDAV bypass
  if (request.headers.get('Authorization')) {
    return handleRequest(request, env);
  }

  const cacheUrl = new URL(request.url);
  const isInProtected =
    cacheUrl.pathname.replace(`/${env.PROTECTED.PROXY_KEYWORD}/`, '').split('/').length <=
    env.PROTECTED.PROTECTED_LAYERS;
  const tokenScopeList = cacheUrl.searchParams.get('ts')?.split(',') || [];
  const isTokenValid = await authenticateToken(env.PASSWORD, cacheUrl, []);
  const isGetAllowed =
    !isInProtected ||
    (env.ASSETS && cacheUrl.pathname === '/') ||
    ((tokenScopeList.includes('download') || tokenScopeList.length === 0) && isTokenValid);

  const requestKeyGenerators = {
    GET: () => (isGetAllowed ? 'verified' : ''),
    POST: async () => await sha256(await request.clone().text()),
  };
  const key = await requestKeyGenerators[method]();

  cacheUrl.pathname = `/${method}` + cacheUrl.pathname + key;
  cacheUrl.search = ''; // avoid query parameters affecting cache entry
  const cacheKey = new Request(cacheUrl.toString());
  const cache = (caches as any).default;
  const cachedResponse: Response | null = await cache.match(cacheKey);

  const cachedAgeSec =
    (Date.now() - new Date(cachedResponse?.headers.get('Expires') || 0).getTime()) / 1000;

  // skip refresh for 302 OneDrive download links (valid for 1 hour)
  if (method === 'GET' && cachedResponse?.status === 302 && cachedAgeSec < 3600) {
    return cachedResponse;
  }

  // expired or forced refresh
  const isCacheExpired = cachedAgeSec > cacheTTL;
  const isForceRefresh = tokenScopeList.includes('refresh') && isTokenValid;

  if (!cachedResponse || isCacheExpired || isForceRefresh) {
    const upstreamResponse = await handleRequest(request, env);
    const freshResponse = new Response(upstreamResponse.body, upstreamResponse);

    freshResponse.headers.set('Expires', new Date(Date.now() + cacheTTL * 1000).toUTCString());
    freshResponse.headers.set('Cache-Control', `max-age=${cacheTTL}`);

    ctx.waitUntil(cache.put(cacheKey, freshResponse.clone()));
    return freshResponse;
  }

  return cachedResponse;
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method as keyof typeof handlers;
  const handlers = {
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
    GET: () => handleGetRequest(request, env, url),
    // Upload or List files
    POST: () => handlePostRequest(request, env, url),
  };

  const handler = handlers[method];
  if (handler) {
    return handler();
  }

  const davMethods = ['COPY', 'DELETE', 'HEAD', 'MKCOL', 'MOVE', 'PROPFIND', 'PUT'];
  if (davMethods.includes(method)) {
    return handleWebdav(request, env, url);
  }

  return new Response(null, { status: 405 });
}
