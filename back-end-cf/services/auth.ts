import { PROTECTED } from '../types';
import { sha256 } from './utils';
import { downloadFile } from '../handlers/file-handler';

export async function authenticate(path: string, passwd?: string): Promise<boolean> {
  try {
    const pwFileContent = await downloadFile(`${path}/${PROTECTED.PASSWD_FILENAME}`, true).then(
      (resp) => (resp.status === 404 ? undefined : resp.text()),
    );

    if (pwFileContent) {
      const hashedPasswd = await sha256(passwd || '');
      return hashedPasswd === pwFileContent;
    } else if (path !== '/' && path.split('/').length <= PROTECTED.PROTECTED_LAYERS) {
      return authenticate('/', passwd);
    }
    return true;
  } catch (e) {
    return false;
  }
}

export function authenticateWebdav(
  davAuthHeader: string | null,
  davCredentials: string | undefined,
): boolean {
  if (!davAuthHeader || !davCredentials) {
    return false;
  }

  const encoder = new TextEncoder();
  const header = encoder.encode(davAuthHeader);
  const expected = encoder.encode(`Basic ${btoa(davCredentials)}`);
  return (
    // @ts-ignore
    header.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(header, expected)
  );
}
