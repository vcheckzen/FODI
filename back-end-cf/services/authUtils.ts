import { runtimeEnv } from '../types/env';
import { sha256 } from './utils';
import { downloadFile } from './fileMethods';

export async function authenticate(
  path: string,
  passwd?: string,
  envPassword?: string,
): Promise<boolean> {
  try {
    if (!passwd && path.split('/').length <= runtimeEnv.PROTECTED.PROTECTED_LAYERS) {
      return false;
    }

    const [hashedPasswd, hashedEnvPassword] = await Promise.all([
      sha256(passwd || ''),
      sha256(envPassword || ''),
    ]);

    if (envPassword && hashedPasswd === hashedEnvPassword) {
      return true;
    }

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
      if (pwFileContent && hashedPasswd === pwFileContent) {
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

  const encoder = new TextEncoder();
  const header = encoder.encode(davAuthHeader);
  const expected = encoder.encode(`Basic ${btoa(`${USERNAME}:${PASSWORD}`)}`);
  return (
    // @ts-ignore
    header.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(header, expected)
  );
}
