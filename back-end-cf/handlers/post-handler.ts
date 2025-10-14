import type { PostPayload } from '../types/apiType';
import { authenticate } from '../services/authUtils';
import { downloadFile, fetchFiles, fetchUploadLinks } from '../services/fileMethods';
import { saveDeployData } from '../services/deployMethods';

export async function handlePostRequest(
  request: Request,
  env: Env,
  requestUrl: URL,
): Promise<Response> {
  // save deploy data
  if (requestUrl.pathname === '/deployreturn') {
    const codeUrlEntry = (await request.formData()).get('codeUrl');
    const codeUrl: string = typeof codeUrlEntry === 'string' ? codeUrlEntry : '';
    return saveDeployData(env, requestUrl, codeUrl);
  }

  const returnHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'max-age=3600',
    'Content-Type': 'application/json; charset=utf-8',
  };
  const body: PostPayload = await request.json();
  const requestPath = body.path || '/';
  const isAuthorized = await authenticate(requestPath, body.passwd, env.PASSWORD);

  // Upload files
  if (requestUrl.searchParams.has('upload')) {
    if (!body.files || body.files.length === 0) {
      return new Response('no files to upload', { status: 400 });
    }

    const isUploadFileExists = (await downloadFile(`${requestPath}/.upload`)).status === 302;
    if (
      !isUploadFileExists ||
      !isAuthorized ||
      body.files?.some(
        (file) =>
          (file.remotePath.split('/').pop() ?? '').toLowerCase() ===
          env.PROTECTED.PASSWD_FILENAME.toLowerCase(),
      )
    ) {
      return new Response('access denied', { status: 403 });
    }

    const uploadLinks = JSON.stringify(await fetchUploadLinks(body.files));
    return new Response(uploadLinks, {
      headers: returnHeaders,
    });
  }

  // List a folder
  const files = isAuthorized
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
