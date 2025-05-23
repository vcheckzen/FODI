import { OAUTH, PROTECTED, fetchFilesRes, DriveItem, UploadPayload } from '../types/apiType';
import { fetchWithAuth, fetchBatchRes } from '../services/utils';

export async function fetchFiles(
  path: string,
  skipToken?: string,
  orderby?: string,
): Promise<fetchFilesRes> {
  const parent = path || '/';

  if (path === '/') path = '';
  if (path || PROTECTED.EXPOSE_PATH) {
    // if PROTECTED.EXPOSE_PATH + path equals to an empty string, ':' will lead to an error.
    path = ':' + encodeURIComponent(PROTECTED.EXPOSE_PATH + path) + ':';
  }
  const expand = [
    '/children?select=name,size,lastModifiedDateTime,@microsoft.graph.downloadUrl',
    // maximum 1000, may change https://github.com/OneDrive/onedrive-api-docs/issues/319
    '&top=1000',
    orderby ? `&orderby=${encodeURIComponent(orderby)}` : '',
    skipToken ? `&skiptoken=${skipToken}` : '',
  ].join('');
  const uri = OAUTH.apiUrl + path + expand;

  const pageRes: DriveItem = await (await fetchWithAuth(uri)).json();
  if (pageRes.error) {
    throw new Error('request failed');
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
      .filter((file) => file.name !== PROTECTED.PASSWD_FILENAME),
  };
}

export async function fetchUploadLinks(fileList: UploadPayload[]) {
  const batchRequest = {
    requests: fileList.map((file, index) => ({
      id: `${index + 1}`,
      method: file['fileSize'] ? 'POST' : 'PUT',
      url: `/me/drive/root:${encodeURI(
        PROTECTED.EXPOSE_PATH + file['remotePath'],
      )}${file['fileSize'] ? ':/createUploadSession' : ':/content'}`,
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
    throw new Error('unsupported target format');
  }

  filePath = encodeURIComponent(`${PROTECTED.EXPOSE_PATH}${filePath}`);
  const uri =
    `${OAUTH.apiUrl}:${filePath}:/content` +
    (format ? `?format=${format}` : '') +
    (format === 'jpg' ? '&width=30000&height=30000' : '');

  const downloadResp = await fetchWithAuth(uri, { redirect: 'manual' });
  const downloadUrl = downloadResp.headers.get('Location');
  const downloadReturnHeaders = new Headers();
  downloadReturnHeaders.set('Last-Modified', new Date().toUTCString());

  if (!downloadUrl) {
    return new Response(null, { status: downloadResp.status });
  }

  if (!stream) {
    downloadReturnHeaders.set('Location', downloadUrl);
    return new Response(null, {
      status: 302,
      headers: downloadReturnHeaders,
    });
  }

  const fileResp = await fetch(downloadUrl);
  if (fileResp) {
    const forwardHeaders = ['Content-Type', 'Content-Length'];
    forwardHeaders.forEach((header) => {
      const value = fileResp.headers.get(header);
      if (value) downloadReturnHeaders.set(header, value);
    });
  }

  return new Response(fileResp.body, {
    status: fileResp.status,
    headers: downloadReturnHeaders,
  });
}
