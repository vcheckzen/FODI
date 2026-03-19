import { sha256, parseJson } from '../services/utils';
import { authorizeScopes } from '../services/authUtils';
import { handleWebdav } from './dav-handler';
import { handleGetRequest } from './get-handler';
import { handlePostRequest } from './post-handler';
import { PostPayload, TokenScope } from '../types/apiType';

export async function cacheRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const method = request.method;
  const rawBody = method === 'POST' ? await request.clone().text() : '{}';
  const scopes = await resolveAuthorizedScopes(request, env, rawBody);

  const cacheTTL = env.CACHE_TTLMAP[method as keyof typeof env.CACHE_TTLMAP] ?? 0;
  if (cacheTTL <= 0) {
    return handleRequest(request, env, scopes);
  }

  // WebDAV bypass
  const cacheUrl = new URL(request.url);
  const isDavGetCache =
    !!env.PROTECTED.PROXY_KEYWORD &&
    cacheUrl.hostname.split('.')[0].endsWith(env.PROTECTED.PROXY_KEYWORD);
  if (request.headers.get('Authorization') && !isDavGetCache) {
    return handleRequest(request, env, scopes);
  }

  const scopeKey = scopes.toString();
  const pathKey =
    rawBody === '{}' ? await sha256(cacheUrl.pathname.toLowerCase()) : await sha256(rawBody);

  cacheUrl.search = ''; // avoid query parameters affecting cache entry
  cacheUrl.pathname = `/${method}/${scopeKey}/${pathKey}`;

  const cacheKey = new Request(cacheUrl.toString().toLowerCase());
  const cache = (caches as any).default;
  const cachedResponse: Response | null = await cache.match(cacheKey);

  const cacheCreatedTime =
    new Date(cachedResponse?.headers.get('Expires') || 0).getTime() - cacheTTL * 1000;
  const cachedAgeSec = (Date.now() - cacheCreatedTime) / 1000;
  // 302 OneDrive download links are valid for 1 hour
  const isLinkExpired = method === 'GET' && cachedResponse?.status === 302 && cachedAgeSec > 3600;
  // expired or forced refresh
  const isCacheExpired = cachedAgeSec > cacheTTL || isLinkExpired;
  const isForceRefresh = scopes.has('refresh');

  if (!cachedResponse || isCacheExpired || isForceRefresh) {
    const upstreamResponse = await handleRequest(request, env, scopes);
    const freshResponse = new Response(upstreamResponse.body, upstreamResponse);

    freshResponse.headers.set('Expires', new Date(Date.now() + cacheTTL * 1000).toUTCString());
    freshResponse.headers.set('Cache-Control', `max-age=${cacheTTL}`);

    ctx.waitUntil(cache.put(cacheKey, freshResponse.clone()));
    return freshResponse;
  }

  return cachedResponse;
}

async function handleRequest(
  request: Request,
  env: Env,
  scopes: ReadonlySet<TokenScope>,
): Promise<Response> {
  const url = new URL(request.url);
  const allowMethods = [
    'COPY',
    'DELETE',
    'GET',
    'HEAD',
    'MKCOL',
    'MOVE',
    'OPTIONS',
    'POST',
    'PROPFIND',
    'PUT',
  ];

  if (!allowMethods.includes(request.method)) {
    return new Response(null, { status: 405 });
  }

  switch (request.method) {
    // Preflight
    case 'OPTIONS':
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': env.RESP_HEADERS['Access-Control-Allow-Origin'],
          'Access-Control-Allow-Headers': env.RESP_HEADERS['Access-Control-Allow-Headers'],
          'Access-Control-Max-Age': env.RESP_HEADERS['Access-Control-Max-Age'],
          DAV: '1, 3',
          ALLOW: allowMethods.join(', '),
          'ms-author-via': 'DAV',
        },
      });
    // Download a file or display web
    case 'GET':
      return handleGetRequest(request, env, url, scopes);
    // Upload or List files
    case 'POST':
      return handlePostRequest(request, env, url, scopes);
    // WebDAV
    default:
      return handleWebdav(request, env, url);
  }
}

async function resolveAuthorizedScopes(request: Request, env: Env, rawBody: string) {
  const url = new URL(request.url);
  const requiredScopes = ['download', 'list'] as TokenScope[];

  if (url.searchParams.has('uplaod')) {
    requiredScopes.push('upload');
  }

  const jsonBody = parseJson<PostPayload>(rawBody);
  const path = jsonBody?.path || url.searchParams.get('file') || decodeURIComponent(url.pathname);
  const scopes = await authorizeScopes(requiredScopes, {
    env,
    url,
    credentials: request.headers.get('Authorization') || jsonBody?.passwd || '',
    path,
  });

  return scopes;
}
