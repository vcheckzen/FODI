import { runtimeEnv, fetchFilesRes, DriveItem, UploadPayload } from '../types/apiType';
import { fetchWithAuth, fetchBatchRes } from './utils';
import { buildUriPath } from './pathUtils';

export async function fetchFiles(
  path: string,
  skipToken?: string,
  orderby?: string,
): Promise<fetchFilesRes> {
  const parent = path || '/';
  const uri = [
    buildUriPath(path, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl),
    '/children?select=name,size,lastModifiedDateTime,@microsoft.graph.downloadUrl',
    // maximum 1000, may change https://github.com/OneDrive/onedrive-api-docs/issues/319
    '&top=1000',
    orderby ? `&orderby=${encodeURIComponent(orderby)}` : '',
    skipToken ? `&skiptoken=${skipToken}` : '',
  ].join('');

  const pageRes: DriveItem = await (await fetchWithAuth(uri)).json();
  if (pageRes.error) {
    throw new Error(JSON.stringify(pageRes.error));
  }

  skipToken = pageRes['@odata.nextLink']
    ? (new URL(pageRes['@odata.nextLink']).searchParams.get('$skiptoken') ?? undefined)
    : undefined;
  const children: DriveItem[] = pageRes.value ?? [];

  return {
    parent,
    skipToken,
    orderby,
    files: children
      .map((file: DriveItem) => ({
        name: file.name,
        size: file.size,
        lastModifiedDateTime: file.lastModifiedDateTime,
        url: file['@microsoft.graph.downloadUrl'],
      }))
      .filter((file) => file.name !== runtimeEnv.PROTECTED.PASSWD_FILENAME),
  };
}

export async function fetchUploadLinks(fileList: UploadPayload[]) {
  const batchRequest = {
    requests: fileList.map((file, index) => ({
      id: `${index + 1}`,
      method: file['fileSize'] ? 'POST' : 'PUT',
      url: `/me/drive/root${buildUriPath(file['remotePath'], runtimeEnv.PROTECTED.EXPOSE_PATH, '')}${file['fileSize'] ? '/createUploadSession' : '/content'}`,
      headers: { 'Content-Type': 'application/json' },
      body: {},
    })),
  };
  const batchResult = await fetchBatchRes(batchRequest);
  batchResult.responses.forEach((response) => {
    if (response.status === 200) {
      const index = parseInt(response.id) - 1;
      fileList[index].uploadUrl = response.body.uploadUrl;
    }
  });
  return { files: fileList };
}

export async function downloadFile(filePath: string, stream?: boolean, format?: string | null) {
  const supportedFormats = ['glb', 'html', 'jpg', 'pdf'];
  if (format && !supportedFormats.includes(format.toLowerCase())) {
    return new Response('Unsupported target format', { status: 400 });
  }

  const uri = [
    buildUriPath(filePath, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl) +
      '/content' +
      (format ? `?format=${format}` : '') +
      (format === 'jpg' ? '&width=30000&height=30000' : ''),
  ].join('');

  const downloadResp = await fetchWithAuth(uri, { redirect: 'manual' });
  const downloadUrl = downloadResp.headers.get('Location');

  if (!downloadUrl) {
    return new Response(null, { status: downloadResp.status });
  }

  // proxy download
  if (stream) {
    return fetch(downloadUrl);
  }

  // direct download
  return Response.redirect(downloadUrl);
}
