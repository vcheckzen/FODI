import { OAUTH, PROTECTED, DavRes, DriveItem } from '../types';
import { authenticateWebdav } from '../services/auth';
import { fetchWithAuth, fetchSkipToken, fetchBatchRes } from '../services/api';
import { davPathSplit, createReturnXml, createPropfindXml } from '../services/dav';
import { fetchUploadLinks } from './file-handler';

export async function handleWebdav(
  filePath: string,
  request: Request,
  davCredentials: string,
): Promise<Response> {
  const davAuth = authenticateWebdav(request.headers.get('Authorization'), davCredentials);
  if (!davAuth) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="WebDAV"',
      },
    });
  }

  const proxyDownload = new URL(request.url).pathname.startsWith(`/${PROTECTED.PROXY_KEYWORD}`);
  const handlers: {
    [key: string]: () => Promise<DavRes> | DavRes;
  } = {
    HEAD: () => handleHead(filePath),
    COPY: () => handleCopyMove(filePath, 'COPY', request.headers.get('Destination')),
    MOVE: () => handleCopyMove(filePath, 'MOVE', request.headers.get('Destination')),
    DELETE: () => handleDelete(filePath),
    MKCOL: () => handleMkcol(filePath),
    PUT: () => handlePut(filePath, request),
    PROPFIND: () => handlePropfind(filePath),
  };
  const handler = handlers[request.method];
  const davRes = await handler();

  const davHeaders = {
    ...(davRes.davXml ? { 'Content-Type': 'application/xml; charset=utf-8' } : {}),
    ...(davRes.davHeaders || {}),
  };
  const davXml =
    proxyDownload && davRes.davXml
      ? davRes.davXml.replaceAll('<d:href>', `<d:href>/${PROTECTED.PROXY_KEYWORD}`)
      : davRes.davXml;

  return new Response(davXml, {
    status: davRes.davStatus,
    headers: davHeaders,
  });
}

async function handleCopyMove(filePath: string, method: string, destination: string | null) {
  const { parent: parent, path: uriPath } = davPathSplit(filePath);
  const uri =
    `${OAUTH.apiUrl}:${encodeURIComponent(PROTECTED.EXPOSE_PATH + uriPath)}` +
    (method === 'COPY' ? ':/copy' : '');
  const { parent: newParent, tail: newTail } = davPathSplit(destination || '');

  const resp = await fetchWithAuth(uri, {
    method: method === 'COPY' ? 'POST' : 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      newParent === parent
        ? { name: newTail }
        : {
            parentReference: {
              path: `/drive/root:${PROTECTED.EXPOSE_PATH}${newParent}`,
            },
          },
    ),
  });

  const davStatus = resp.status === 200 ? 201 : resp.status;
  const responseXML =
    davStatus === 201 ? null : createReturnXml(uriPath, davStatus, resp.statusText);

  return { davXml: responseXML, davStatus: davStatus };
}

async function handleDelete(filePath: string) {
  const uriPath = davPathSplit(filePath).path;
  const uri = `${OAUTH.apiUrl}:${encodeURIComponent(PROTECTED.EXPOSE_PATH + uriPath)}`;

  const res = await fetchWithAuth(uri, { method: 'DELETE' });
  const davStatus = res.status;
  const responseXML =
    davStatus === 204 ? null : createReturnXml(uriPath, davStatus, res.statusText);

  return { davXml: responseXML, davStatus: davStatus };
}

async function handleHead(filePath: string) {
  const uri = [
    OAUTH.apiUrl,
    `:${encodeURIComponent(PROTECTED.EXPOSE_PATH + davPathSplit(filePath).path)}`,
    '?select=size,file,lastModifiedDateTime',
  ].join('');
  const resp = await fetchWithAuth(uri);
  const data: DriveItem = await resp.json();

  return {
    davXml: null,
    davStatus: data?.file ? 200 : 403,
    davHeaders: data?.file
      ? {
          'Content-Length': data.size.toString(),
          'Content-Type': data.file.mimeType,
          'Last-Modified': new Date(data.lastModifiedDateTime).toUTCString(),
        }
      : {},
  };
}

async function handleMkcol(filePath: string) {
  const { parent, tail } = davPathSplit(filePath);
  const uri = `${OAUTH.apiUrl}:${encodeURIComponent(PROTECTED.EXPOSE_PATH + parent)}:/children`;

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
  const responseXML = davStatus === 201 ? null : createReturnXml(parent, davStatus, res.statusText);

  return { davXml: responseXML, davStatus: davStatus };
}

async function handlePropfind(filePath: string) {
  const { parent, tail, isDirectory, path } = davPathSplit(filePath);
  const fetchPath = isDirectory ? path : parent;
  let allFiles = [],
    files: DriveItem[];

  const currentTokens = await fetchSkipToken(fetchPath);
  const uriPath =
    fetchPath === `/` ? PROTECTED.EXPOSE_PATH : `:${PROTECTED.EXPOSE_PATH}${fetchPath}:`;
  const baseUrl = `/me/drive/root${uriPath}/children?select=name,size,lastModifiedDateTime,file`;

  const createRequest = (id: string, skipToken?: string) => ({
    id,
    method: 'GET',
    url: skipToken ? `${baseUrl}&skipToken=${skipToken}` : baseUrl,
    headers: { 'Content-Type': 'application/json' },
    body: {},
  });

  const batchRequest = {
    requests: [
      createRequest('1'),
      ...currentTokens.map((token, index) => createRequest(`${index + 2}`, token)),
    ],
  };

  const batchResult = await fetchBatchRes(batchRequest);
  for (const resp of batchResult.responses) {
    if (resp.status !== 200) {
      return {
        davXml: createReturnXml(fetchPath, resp.status, 'Failed to fetch files'),
        davStatus: resp.status,
      };
    }

    const value = resp.body.value as unknown as DriveItem[];
    allFiles.push(
      ...value.map((file: DriveItem) => ({
        name: file.name,
        size: file.size,
        lastModifiedDateTime: file.lastModifiedDateTime,
        file: file.file,
      })),
    );

    const nextLink = resp.body['@odata.nextLink'];
    const skipToken = nextLink ? new URL(nextLink).searchParams.get('$skiptoken') : undefined;
    if (skipToken && !currentTokens.includes(skipToken)) {
      await fetchSkipToken(fetchPath, skipToken);
    }
  }

  if (isDirectory) {
    files = allFiles;
  } else {
    const targetFile = allFiles.find((file) => file.name === tail);

    if (!targetFile) return { davXml: null, davStatus: 404 };

    files = [targetFile];
  }

  const responseXML = createPropfindXml(fetchPath, files, isDirectory);
  return { davXml: responseXML, davStatus: 207 };
}

async function handlePut(filePath: string, request: Request) {
  const contentLength = request.headers.get('Content-Length') || '0';
  const fileLength = parseInt(contentLength);
  const body = await request.arrayBuffer();
  const uploadList = [{ remotePath: filePath, fileSize: fileLength }];
  const uploadUrl = (await fetchUploadLinks(uploadList)).files[0].uploadUrl;

  if (!uploadUrl) {
    return {
      davXml: createReturnXml(filePath, 500, 'Failed to get upload URL'),
      davStatus: 500,
    };
  }

  const chunkSize = 1024 * 1024 * 60;
  let start = 0,
    newStart,
    retryCount = 0;
  const maxRetries = 3;
  const initialDelay = 2000;

  while (start < fileLength) {
    const end = Math.min(start + chunkSize, fileLength);
    const chunk = body.slice(start, end);

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      body: chunk,
      headers: {
        'Content-Range': `bytes ${start}-${end - 1}/${fileLength}`,
      },
    });

    if (res.status >= 400) {
      const data = await fetch(uploadUrl);
      const jsonData: any = await data.json();
      newStart = parseInt(jsonData.nextExpectedRanges[0].split('-')[0]);

      if (!newStart) {
        return {
          davXml: createReturnXml(filePath, res.status, res.statusText),
          davStatus: res.status,
        };
      }

      if (retryCount < maxRetries) {
        const delay = initialDelay * Math.pow(2, retryCount);
        await new Promise((resolve) => setTimeout(resolve, delay));
        retryCount++;
        continue;
      } else {
        return {
          davXml: createReturnXml(filePath, res.status, 'Max retries exceeded'),
          davStatus: res.status,
        };
      }
    }

    retryCount = 0;
    start = newStart || end;
    newStart = undefined;
  }

  return { davXml: null, davStatus: 201 };
}
