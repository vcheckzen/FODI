import { sha256, secureEqual, hmacSha256 } from './utils';
import { downloadFile } from './fileMethods';
import type { TokenScope } from '../types/apiType';

async function authenticatePost(env: Env, path: string, passwd?: string): Promise<boolean> {
  // empty input password, improve loading speed
  if (!passwd) {
    return false;
  }

  // check env password
  if (env.PASSWORD && secureEqual(passwd, env.PASSWORD)) {
    return true;
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

async function getTokenScopes(
  envPW: string | undefined,
  pathname: string,
  searchParams: URLSearchParams,
): Promise<TokenScope[]> {
  const tokenScopeList = (searchParams.get('ts') || 'download').split(',') as TokenScope[];
  const token = searchParams.get('token')?.toLowerCase();
  if (!token || !envPW) {
    return [];
  }

  const expires = searchParams.get('te');
  if (expires) {
    const now = Math.floor(Date.now() / 1000);
    const exp = parseInt(expires);
    if (isNaN(exp) || now > exp) {
      return [];
    }
  }

  const tokenArgString = [tokenScopeList.join(','), expires].filter(Boolean).join(',');
  const path = decodeURIComponent(pathname);

  const candidatePaths = new Set<string>();
  candidatePaths.add(path);

  const childrenAuth =
    (tokenScopeList.length === 1 && tokenScopeList[0] === 'download') ||
    tokenScopeList.includes('children');
  if (childrenAuth) {
    const beginPath = path.split('/').slice(0, -1).join('/') || '/';
    candidatePaths.add(beginPath);
  }

  if (tokenScopeList.includes('recursive')) {
    const beginPath = searchParams.get('tb') || '/';
    if (!path.startsWith(beginPath)) {
      return [];
    }
    candidatePaths.add(beginPath);
  }

  for (const p of candidatePaths) {
    const sign = await hmacSha256(envPW, [p, tokenArgString].join(','));
    if (token === sign) {
      return tokenScopeList.sort();
    }
  }

  return [];
}

interface AuthContext {
  env: Env;
  url: URL;
  passwd?: string;
  postPath?: string;
}

export async function authorizeActions(
  actions: readonly TokenScope[],
  ctx: AuthContext,
): Promise<Set<TokenScope>> {
  const allowed = new Set<TokenScope>();
  const { env, url, passwd, postPath } = ctx;
  const publicActions: TokenScope[] = ['list', 'download'];

  const path = postPath || url.searchParams.get('file') || decodeURIComponent(url.pathname);
  const tokenScopes = await getTokenScopes(env.PASSWORD, path, url.searchParams);

  for (const action of actions) {
    if (env.PROTECTED.REQUIRE_AUTH !== true && publicActions.includes(action)) {
      allowed.add(action);
      continue;
    }

    if (tokenScopes.includes(action)) {
      allowed.add(action);
      continue;
    }

    let ok = false;
    // if passwd null/undefined, this auth path is skipped to improve performance
    switch (action) {
      case 'download':
        ok = authenticateWebdav(passwd ?? null, env.USERNAME, env.PASSWORD);
        break;

      case 'list':
        ok = await authenticatePost(env, path, passwd);
        break;

      case 'upload':
        ok =
          (await authenticatePost(env, path, passwd)) &&
          (await downloadFile(`${path}/.upload`)).status === 302;
        break;
    }

    if (ok) allowed.add(action);
  }

  return allowed;
}
