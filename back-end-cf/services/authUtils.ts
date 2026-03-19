import { sha256, secureEqual, hmacSha256 } from './utils';
import { downloadFile } from './fileMethods';
import type { TokenScope } from '../types/apiType';

async function authenticatePost(env: Env, path: string, passwd?: string): Promise<boolean> {
  // empty input password, improve loading speed
  if (!passwd) {
    return false;
  }

  // check password files in onedrive
  const hashedPasswd = await sha256(passwd || '');
  const candidatePaths = new Set<string>();
  candidatePaths.add(path === '/' ? '' : path);
  candidatePaths.add('');

  const downloads = await Promise.all(
    Array.from(candidatePaths).map((p) =>
      downloadFile(`${p}/${env.PROTECTED.PASSWD_FILENAME}`, true).then((resp) =>
        resp.status === 404 ? undefined : resp.text(),
      ),
    ),
  );

  for (const pwFileContent of downloads) {
    if (pwFileContent && secureEqual(hashedPasswd, pwFileContent.toLowerCase())) {
      return true;
    }
  }
  return downloads.every((content) => content === undefined);
}

export function authenticateWebdav(
  davAuthHeader: string | null,
  USERNAME: string | undefined,
  PASSWORD: string | undefined,
): boolean {
  if (!davAuthHeader || !USERNAME || !PASSWORD) {
    return false;
  }

  return secureEqual(davAuthHeader, `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}`);
}

async function authorizeToken(
  secret: string | undefined,
  reqPath: string,
  searchParams: URLSearchParams,
): Promise<TokenScope[]> {
  const token = searchParams.get('token')?.toLowerCase();
  if (!token || !secret) {
    return [];
  }

  const tokenScope = searchParams.get('ts') || 'download';
  const expires = searchParams.get('te');
  const authPath = searchParams.get('tb') ?? '/';
  const tokenArgString = [tokenScope, expires].filter(Boolean).join(',');

  const candidatePaths = new Set<string>();
  candidatePaths.add(reqPath);

  if (expires) {
    const now = Math.floor(Date.now() / 1000);
    const exp = parseInt(expires);
    if (isNaN(exp) || now > exp) {
      return [];
    }
  }

  if (tokenScope.includes('children') || tokenScope === 'download') {
    const beginPath = reqPath.split('/').slice(0, -1).join('/') || '/';
    candidatePaths.add(beginPath);
  }

  if (tokenScope.includes('recursive')) {
    if (reqPath.startsWith(authPath)) {
      candidatePaths.add(authPath);
    }
  }

  for (const p of candidatePaths) {
    const expectedSign = await hmacSha256(secret, `${p},${tokenArgString}`);
    if (token === expectedSign) {
      return tokenScope.split(',').sort() as TokenScope[];
    }
  }

  return [];
}

interface AuthContext {
  env: Env;
  url: URL;
  credentials: string;
  path: string;
}

export async function authorizeScopes(
  requiredScopes: readonly TokenScope[],
  ctx: AuthContext,
): Promise<ReadonlySet<TokenScope>> {
  const allowed = new Set<TokenScope>();
  const { env, url, credentials, path } = ctx;
  const tokenScopes = await authorizeToken(env.PASSWORD, path, url.searchParams);

  const authPaths = env.PROTECTED.AUTH_PATHS.map((item) => item.toLowerCase());
  const isExceptionPath = authPaths.includes(path.toLowerCase());
  const requiresAuthForPath = env.PROTECTED.REQUIRE_AUTH ? !isExceptionPath : isExceptionPath;

  for (const scope of requiredScopes) {
    if (tokenScopes.includes(scope)) {
      allowed.add(scope);
      continue;
    }

    let ok = false;
    switch (scope) {
      case 'download':
        ok =
          !requiresAuthForPath ||
          authenticateWebdav(credentials ?? null, env.USERNAME, env.PASSWORD);
        break;

      case 'list':
        ok =
          !requiresAuthForPath ||
          secureEqual(credentials, env.PASSWORD) ||
          (await authenticatePost(env, path, credentials));
        break;

      case 'upload':
        ok =
          (secureEqual(credentials, env.PASSWORD) ||
            (await authenticatePost(env, path, credentials))) &&
          (await downloadFile(`${path}/.upload`)).status === 302;
        break;
    }

    if (ok) {
      allowed.add(scope);
    }
  }

  return allowed;
}
