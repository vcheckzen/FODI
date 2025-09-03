import { DriveItem, runtimeEnv } from '../types/apiType';
import { fetchWithAuth, fetchBatchRes, fetchSaveSkipToken } from './utils';
import { createReturnXml, createPropfindXml } from './davUtils';
import { parsePath, buildUriPath } from './pathUtils';

export async function handlePropfind(filePath: string) {
  const { path, parent } = parsePath(filePath);
  const allFiles: DriveItem[] = [];
  const skipTokens: string[] = [];

  const currentTokens = await fetchSaveSkipToken(path);
  const itemPathWrapped = buildUriPath(path, runtimeEnv.PROTECTED.EXPOSE_PATH, '');
  const select = '?select=name,size,lastModifiedDateTime,file';
  const baseUrl = `/me/drive/root${itemPathWrapped}/children${select}&top=1000`;

  const createListRequest = (id: string, skipToken?: string) => ({
    id,
    method: 'GET',
    url: skipToken ? `${baseUrl}&skipToken=${skipToken}` : baseUrl,
    headers: { 'Content-Type': 'application/json' },
    body: {},
  });

  const batchRequest = {
    requests: [
      {
        id: '1',
        method: 'GET',
        url: `/me/drive/root${itemPathWrapped}${select}`,
        headers: { 'Content-Type': 'application/json' },
        body: {},
      },
      createListRequest('2'),
      ...currentTokens.map((token, index) => createListRequest(`${index + 3}`, token)),
    ],
  };

  const batchResult = await fetchBatchRes(batchRequest);
  batchResult.responses.sort((a, b) => parseInt(a.id) - parseInt(b.id));

  for (const resp of batchResult.responses) {
    if (resp.status !== 200) {
      return {
        davXml: createReturnXml(filePath, resp.status, 'Failed to fetch files'),
        davStatus: resp.status,
      };
    }

    if (resp.id === '1') {
      allFiles.push({
        ...(resp.body as unknown as DriveItem),
        name: resp.body.file ? resp.body.name : '',
      });
      continue;
    }

    const items = resp.body.value as unknown as DriveItem[];
    allFiles.push(...items);

    const skipToken = resp.body['@odata.nextLink']
      ? (new URL(resp.body['@odata.nextLink']).searchParams.get('$skiptoken') ?? undefined)
      : undefined;
    if (skipToken) {
      skipTokens.push(skipToken);
    }
  }

  await fetchSaveSkipToken(path, skipTokens);

  const propfindPath = allFiles[0]?.file ? parent : path;
  const responseXML = createPropfindXml(propfindPath, allFiles);
  return { davXml: responseXML, davStatus: 207 };
}

export async function handleCopyMove(
  filePath: string,
  method: 'COPY' | 'MOVE',
  destination: string,
) {
  const { parent: newParent, tail: newTail } = parsePath(destination);
  const uri =
    buildUriPath(filePath, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl) +
    (method === 'COPY' ? '/copy' : '');

  const resp = await fetchWithAuth(uri, {
    method: method === 'COPY' ? 'POST' : 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: newTail,
      parentReference: {
        path: `/drive/root:${runtimeEnv.PROTECTED.EXPOSE_PATH}${newParent}`,
      },
    }),
  });

  const davStatus = resp.status === 200 ? 201 : resp.status;
  const responseXML =
    davStatus === 201 ? null : createReturnXml(filePath, davStatus, resp.statusText);

  return { davXml: responseXML, davStatus: davStatus };
}

export async function handleDelete(filePath: string) {
  const uri = buildUriPath(filePath, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl);
  const res = await fetchWithAuth(uri, { method: 'DELETE' });
  const davStatus = res.status;
  const responseXML =
    davStatus === 204 ? null : createReturnXml(filePath, davStatus, res.statusText);

  return { davXml: responseXML, davStatus: davStatus };
}

export async function handleHead(filePath: string) {
  const uri = [
    buildUriPath(filePath, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl),
    '?select=size,file,folder,lastModifiedDateTime',
  ].join('');
  const resp = await fetchWithAuth(uri);
  const data: DriveItem = await resp.json();

  return {
    davXml: null,
    davStatus: data?.folder ? 403 : resp.status,
    davHeaders: data?.file
      ? {
          'Content-Length': data.size.toString(),
          'Content-Type': data.file.mimeType,
          'Last-Modified': new Date(data.lastModifiedDateTime).toUTCString(),
        }
      : {},
  };
}

export async function handleMkcol(filePath: string) {
  const { parent, tail } = parsePath(filePath);
  const uri =
    buildUriPath(parent, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl) + '/children';

  const res = await fetchWithAuth(uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: tail,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'replace',
    }),
  });

  const davStatus = res.status === 200 ? 201 : res.status;
  const responseXML =
    davStatus === 201 ? null : createReturnXml(filePath, davStatus, res.statusText);

  return { davXml: responseXML, davStatus: davStatus };
}

export async function handlePut(filePath: string, request: Request) {
  const simpleUploadLimit = 4 * 1024 * 1024; // 4MB
  const chunkSize = 60 * 1024 * 1024;
  const contentLength = request.headers.get('Content-Length') || '0';
  const fileSize = parseInt(contentLength);
  const fileBuffer = await request.arrayBuffer();

  if (fileSize <= simpleUploadLimit) {
    const uri =
      buildUriPath(filePath, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl) +
      '/content';
    const res = await fetchWithAuth(uri, {
      method: 'PUT',
      body: fileBuffer,
    });

    if (!res.ok) {
      return {
        davXml: createReturnXml(filePath, res.status, res.statusText),
        davStatus: res.status,
      };
    }

    return { davXml: null, davStatus: 201 };
  }

  const uri =
    buildUriPath(filePath, runtimeEnv.PROTECTED.EXPOSE_PATH, runtimeEnv.OAUTH.apiUrl) +
    '/createUploadSession';
  const uploadSessionRes = await fetchWithAuth(uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item: { '@microsoft.graph.conflictBehavior': 'replace' },
    }),
  });

  const { uploadUrl } = (await uploadSessionRes.json()) as { uploadUrl?: string };
  if (!uploadUrl) {
    return {
      davXml: createReturnXml(filePath, 500, 'Invalid upload session'),
      davStatus: 500,
    };
  }

  let offset = 0;
  while (offset < fileSize) {
    const chunkEnd = Math.min(offset + chunkSize, fileSize);
    const chunk = fileBuffer.slice(offset, chunkEnd);
    const contentRange = `bytes ${offset}-${chunkEnd - 1}/${fileSize}`;

    const res = await uploadChunk(uploadUrl, chunk, contentRange);
    if (!res.ok) {
      return {
        davXml: createReturnXml(filePath, res.status, 'Upload failed'),
        davStatus: res.status,
      };
    }

    offset = chunkEnd;
  }

  return { davXml: null, davStatus: 201 };
}

async function uploadChunk(uploadUrl: string, chunk: ArrayBuffer, contentRange: string) {
  const maxRetries = 3;
  const retryDelay = 2000;
  let attempt = 0;

  while (attempt < maxRetries) {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      body: chunk,
      headers: {
        'Content-Length': chunk.byteLength.toString(),
        'Content-Range': contentRange,
      },
    });

    if (res.ok) {
      return res;
    }

    if (res.status >= 500) {
      const delay = retryDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    } else {
      return res;
    }
  }

  return new Response(null, { status: 500, statusText: 'Max retries exceeded' });
}
