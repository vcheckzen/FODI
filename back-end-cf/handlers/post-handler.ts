import { PROTECTED, PostPayload, Env } from '../types';
import { authenticate } from '../services/auth';
import { downloadFile, fetchFiles, fetchUploadLinks } from './file-handler';

export async function handlePostRequest(
  request: Request,
  env: Env,
  requestUrl: URL,
): Promise<Response> {
  const returnHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'max-age=3600',
    'Content-Type': 'application/json; charset=utf-8',
  };
  const body: PostPayload = await request.json();
  const requestPath = decodeURIComponent(body.path || '');

  // Upload files
  if (requestUrl.searchParams.has('upload')) {
    const allowUpload = (await downloadFile(`${requestPath}/.upload`)).status === 302;

    const uploadAuth = await authenticate(requestPath, body.passwd, env.WEBDAV);

    if (
      !allowUpload ||
      !uploadAuth ||
      body.files?.some(
        (file) =>
          (file.remotePath.split('/').pop() ?? '').toLowerCase() ===
          PROTECTED.PASSWD_FILENAME.toLowerCase(),
      )
    ) {
      throw new Error('access denied');
    }

    if (!body.files || body.files.length === 0) {
      return new Response('no files to upload', { status: 400 });
    }

    const uploadLinks = JSON.stringify(await fetchUploadLinks(body.files));
    return new Response(uploadLinks, {
      headers: returnHeaders,
    });
  }

  // List a folder
  const listAuth = await authenticate(requestPath, body.passwd, env.WEBDAV);
  const files = listAuth
    ? await fetchFiles(requestPath, body.skipToken, body.orderby)
    : {
        parent: requestPath,
        files: [],
        encrypted: true,
      };
  return new Response(JSON.stringify(files), {
    headers: returnHeaders,
  });
}
