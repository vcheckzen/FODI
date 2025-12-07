import { runtimeEnv } from '../types/env';
import { sha256, secureEqual } from './utils';
import { downloadFile } from './fileMethods';
import { TokenScope } from '../types/apiType';

export async function authenticatePost(
  path: string,
  passwd?: string,
  envPasswd?: string,
): Promise<boolean> {
  try {
    // empty input password, improve loading speed
    if (!passwd && path.split('/').length <= runtimeEnv.PROTECTED.PROTECTED_LAYERS) {
      return false;
    }

    // check env password
    if (envPasswd && secureEqual(passwd, envPasswd)) {
      return true;
    }

    // check password files in onedrive
    const hashedPasswd = await sha256(passwd || '');
    const pathsToTry = [path === '/' ? '' : path];
    if (path !== '/' && path.split('/').length <= runtimeEnv.PROTECTED.PROTECTED_LAYERS) {
      pathsToTry.push('');
    }
    const downloads = await Promise.all(
      pathsToTry.map((p) =>
        downloadFile(`${p}/${runtimeEnv.PROTECTED.PASSWD_FILENAME}`, true).then((resp) =>
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
  } catch (e) {
    return false;
  }
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

/**
 * @param envPasswd The environment password used to generate and validate the token.
 * @param url The URL object containing the token and related query parameters.
 * @param needScope An array of required scopes that the token must include.
 * @returns Returns true if the token is valid, has the required scopes, and is not expired; false otherwise.
 */
export async function authenticateToken(
  envPasswd: string | undefined,
  url: URL,
  needScope: TokenScope[],
): Promise<boolean> {
  const token = url.searchParams.get('token')?.toLowerCase();
  if (!token || !envPasswd) {
    return false;
  }

  const userScope = (url.searchParams.get('ts') || 'download').split(',');
  if (!needScope.every((s) => userScope.includes(s))) {
    return false;
  }

  const expires = url.searchParams.get('te');
  if (expires) {
    const now = Math.floor(Date.now() / 1000);
    const exp = parseInt(expires);
    if (isNaN(exp) || now > exp) {
      return false;
    }
  }

  const path = url.pathname;
  const parent = path.split('/').slice(0, -1).join('/') || '/';
  const tokenArgString = [userScope.join(','), expires].filter(Boolean).join(',');
  const pathSign = [envPasswd, path, tokenArgString].join(',');
  const parentSign = [envPasswd, parent, tokenArgString].join(',');

  const validTokens = Promise.all([sha256(pathSign), sha256(parentSign)]);
  const isValid = (await validTokens).some((validToken) => secureEqual(token, validToken));

  return isValid;
}
