import type { PostPayload } from '../types/apiType';
import { fetchFiles, fetchUploadLinks } from '../services/fileMethods';
import { saveDeployData } from '../services/deployMethods';
import { authorizeActions } from '../services/authUtils';
import { parseJson } from '../services/utils';

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

  const body = parseJson<PostPayload>(await request.text());
  if (!body) {
    return new Response('invalid post body', { status: 400 });
  }

  const returnHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'max-age=3600',
    'Content-Type': 'application/json; charset=utf-8',
  };
  const requestPath = body.path || '/';

  // Upload files
  if (requestUrl.searchParams.has('upload')) {
    if (!body.files || body.files.length === 0) {
      return new Response('no files to upload', { status: 400 });
    }

    const isUploadAllowed = (
      await authorizeActions(['upload'], {
        env,
        url: requestUrl,
        passwd: body.passwd,
        postPath: requestPath,
      })
    ).has('upload');

    if (
      !isUploadAllowed ||
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
  const isListAllowed = (
    await authorizeActions(['list'], {
      env,
      url: requestUrl,
      passwd: body.passwd,
      postPath: requestPath,
    })
  ).has('list');
  const filesRes = isListAllowed
    ? await fetchFiles(requestPath, body.skipToken, body.orderby)
    : {
        parent: requestPath,
        files: [],
        encrypted: true,
      };

  return new Response(JSON.stringify(filesRes), {
    headers: returnHeaders,
  });
}
