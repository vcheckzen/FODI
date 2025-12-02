import { runtimeEnv } from '../types/env';
import { sha256 } from './utils';
import { downloadFile } from './fileMethods';

export async function authenticatePost(
  path: string,
  passwd?: string,
  envPassword?: string,
): Promise<boolean> {
  try {
    // empty input password, improve loading speed
    if (!passwd && path.split('/').length <= runtimeEnv.PROTECTED.PROTECTED_LAYERS) {
      return false;
    }

    // check env password
    const [hashedPasswd, hashedEnvPassword] = await Promise.all([
      sha256(passwd || ''),
      sha256(envPassword || ''),
    ]);

    if (envPassword && secureEqual(hashedPasswd, hashedEnvPassword)) {
      return true;
    }

    // check password files in onedrive
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

export function secureEqual(input: string | undefined, expected: string | undefined): boolean {
  if (!expected) {
    return false;
  }

  try {
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
