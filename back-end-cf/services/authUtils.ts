import { sha256 } from './utils';
import { downloadFile } from './fileMethods';
import type { TokenScope } from '../types/apiType';

async function hmacSha256(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const buffer = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function secureEqual(input: string | undefined, expected: string | undefined): boolean {
  if (!input || !expected) {
    return false;
  }

  try {
    // Compare in constant time to reduce timing side-channel leakage.
    const encoder = new TextEncoder();
    const inputData = encoder.encode(input);
    const expectedData = encoder.encode(expected);
    return (
      inputData.byteLength === expectedData.byteLength &&
      // @ts-ignore
      crypto.subtle.timingSafeEqual(inputData, expectedData)
    );
  } catch (e) {
    return false;
  }
}

async function authenticatePost(env: Env, path: string, passwd?: string): Promise<boolean> {
  // empty input password, improve loading speed
  if (!passwd) {
    return false;
  }

  // A path can inherit the root password file, so check both current path and root.
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

  // No password file means the path is treated as public for POST access.
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
): Promise<ReadonlySet<TokenScope>> {
  const token = searchParams.get('token')?.toLowerCase();
  if (!token || !secret) {
    return new Set();
  }

  const tokenScope = searchParams.get('ts') || 'download';
  const expires = searchParams.get('te');
  const authPath = searchParams.get('tb') ?? '/';
  const tokenArgString = [tokenScope, expires].filter(Boolean).join(',');

  // A token may be valid for the file itself, its parent, or an explicit recursive base path.
  const candidatePaths = new Set<string>();
  candidatePaths.add(reqPath);

  if (expires) {
    const now = Math.floor(Date.now() / 1000);
    const exp = parseInt(expires);
    if (isNaN(exp) || now > exp) {
      return new Set();
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
      return new Set(tokenScope.split(',') as TokenScope[]);
    }
  }

  return new Set();
}

interface AuthContext {
  env: Env;
  url: URL;
  credentials: string;
  path: string;
}

export async function authorizeScopes(
  requiredScopes: Set<TokenScope>,
  ctx: AuthContext,
): Promise<ReadonlySet<TokenScope>> {
  const allowed = new Set<TokenScope>();
  const { env, url, credentials, path } = ctx;
  const tokenScopes = await authorizeToken(env.PASSWORD, path, url.searchParams);

  const authPaths = env.PROTECTED.AUTH_PATHS.map((item) => item.toLowerCase());
  const isExceptionPath = authPaths.includes(path.toLowerCase());
  // REQUIRE_AUTH flips AUTH_PATHS between whitelist and blacklist behavior.
  const canSkipAuth = env.PROTECTED.REQUIRE_AUTH ? isExceptionPath : !isExceptionPath;

  let pwAuth: boolean | undefined;
  const hasEnvPasswordAccess = () => {
    pwAuth ??= secureEqual(credentials, env.PASSWORD);
    return pwAuth;
  };

  let postAuth: Promise<boolean> | undefined;
  const hasPostAccess = () => {
    if (canSkipAuth) {
      return Promise.resolve(true);
    }

    if (hasEnvPasswordAccess()) {
      return Promise.resolve(true);
    }

    // Reuse the async password-file check when multiple scopes are evaluated in one request.
    postAuth ??= authenticatePost(env, path, credentials);
    return postAuth;
  };

  let uploadAuth: Promise<boolean> | undefined;
  const hasUploadAccess = async () => {
    if (!(await hasPostAccess())) {
      return false;
    }

    // Upload requires POST access plus an explicit .upload marker at the target path.
    uploadAuth ??= downloadFile(`${path}/.upload`).then((resp) => resp.status === 302);
    return uploadAuth;
  };

  for (const scope of requiredScopes) {
    if (tokenScopes.has(scope)) {
      allowed.add(scope);
      continue;
    }

    let ok = false;
    switch (scope) {
      case 'download':
        ok = canSkipAuth || authenticateWebdav(credentials, env.USERNAME, env.PASSWORD);
        break;

      case 'list':
        ok = await hasPostAccess();
        break;

      case 'upload':
        ok = await hasUploadAccess();
        break;

      default:
        ok = hasEnvPasswordAccess();
        break;
    }

    if (ok) {
      allowed.add(scope);
    }
  }

  return allowed;
}
