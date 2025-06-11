// back-end-cf/types/apiType.ts
import { env as globalEnv } from 'cloudflare:workers';
var localEnv = {};
var OAUTH = globalEnv.OAUTH || localEnv.OAUTH;
var PROTECTED = globalEnv.PROTECTED || localEnv.PROTECTED;
var FODI_CACHE = globalEnv.FODI_CACHE;

// back-end-cf/services/utils.ts
async function fetchAccessToken(envOauth, envFodi) {
  let refreshToken = envOauth.refreshToken;
  if (envFodi !== void 0) {
    const tokenData = await envFodi.get('token_data');
    const cache = tokenData ? JSON.parse(tokenData) : null;
    if (cache?.refresh_token) {
      const passedMilis = Date.now() - cache.save_time;
      if (passedMilis / 1e3 < cache.expires_in - 600) {
        return cache.access_token;
      }
      if (passedMilis < 6912e6) {
        refreshToken = cache.refresh_token;
      }
    }
  }
  const url = envOauth['oauthUrl'] + 'token';
  const data = {
    client_id: envOauth['clientId'],
    client_secret: envOauth['clientSecret'],
    grant_type: 'refresh_token',
    requested_token_use: 'on_behalf_of',
    refresh_token: refreshToken,
  };
  const result = await postFormData(url, data);
  if (envFodi !== void 0 && result?.refresh_token) {
    result.save_time = Date.now();
    await envFodi.put('token_data', JSON.stringify(result));
  }
  return result.access_token;
}
async function fetchWithAuth(uri, options = {}) {
  const accessToken = await fetchAccessToken(OAUTH, FODI_CACHE);
  return fetch(uri, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
}
async function fetchBatchRes(batch) {
  const batchResponse = await fetchWithAuth(`${OAUTH.apiHost}/v1.0/$batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });
  return batchResponse.json();
}
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function postFormData(url, data) {
  const formData = new FormData();
  for (const key in data) {
    formData.append(key, data[key]);
  }
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });
  const result = await response.json();
  return result;
}
async function fetchSaveSkipToken(path, tokensToSave) {
  path = path.toLocaleLowerCase();
  const skipTokenString = await FODI_CACHE.get('skip_token');
  const skipTokenData = skipTokenString ? JSON.parse(skipTokenString) : {};
  const currentTokens = skipTokenData[path]?.split(',') || [];
  const tokenChanged = tokensToSave && currentTokens.join(',') !== tokensToSave.join(',');
  if (tokenChanged) {
    skipTokenData[path] = tokensToSave.join(',');
    await FODI_CACHE.put('skip_token', JSON.stringify(skipTokenData));
  }
  return currentTokens;
}

// back-end-cf/handlers/file-handler.ts
async function fetchFiles(path, skipToken, orderby) {
  const parent = path || '/';
  if (path === '/') path = '';
  if (path || PROTECTED.EXPOSE_PATH) {
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
  const pageRes = await (await fetchWithAuth(uri)).json();
  if (pageRes.error) {
    throw new Error('request failed');
  }
  skipToken = pageRes['@odata.nextLink']
    ? (new URL(pageRes['@odata.nextLink']).searchParams.get('$skiptoken') ?? void 0)
    : void 0;
  const children = pageRes.value ?? [];
  return {
    parent,
    skipToken,
    orderby,
    files: children
      .map((file) => ({
        name: file.name,
        size: file.size,
        lastModifiedDateTime: file.lastModifiedDateTime,
        url: file['@microsoft.graph.downloadUrl'],
      }))
      .filter((file) => file.name !== PROTECTED.PASSWD_FILENAME),
  };
}
async function fetchUploadLinks(fileList) {
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
async function downloadFile(filePath, stream, format) {
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
  downloadReturnHeaders.set('Last-Modified', /* @__PURE__ */ new Date().toUTCString());
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

// back-end-cf/services/auth.ts
async function authenticate(path, passwd, davCredentials) {
  try {
    const [hashedPasswd, hashedDav] = await Promise.all([
      sha256(passwd || ''),
      sha256(davCredentials?.split(':')[1] || ''),
    ]);
    if (davCredentials && hashedPasswd === hashedDav) {
      return true;
    }
    const pathsToTry = [path];
    if (path !== '/' && path.split('/').length <= PROTECTED.PROTECTED_LAYERS) {
      pathsToTry.push('/');
    }
    const downloads = await Promise.all(
      pathsToTry.map((p) =>
        downloadFile(`${p}/${PROTECTED.PASSWD_FILENAME}`, true).then((resp) =>
          resp.status === 404 ? void 0 : resp.text(),
        ),
      ),
    );
    for (const pwFileContent of downloads) {
      if (pwFileContent && hashedPasswd === pwFileContent) {
        return true;
      }
    }
    return downloads.every((content) => content === void 0);
  } catch (e) {
    return false;
  }
}
function authenticateWebdav(davAuthHeader, davCredentials) {
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

// back-end-cf/services/dav.ts
function davPathSplit(filePath) {
  filePath = filePath.includes('://') ? decodeURIComponent(new URL(filePath).pathname) : filePath;
  if (!filePath) filePath = '/';
  const isDirectory = filePath.endsWith('/');
  const nomalizePath = isDirectory ? filePath.slice(0, -1) : filePath;
  return {
    parent: nomalizePath.split('/').slice(0, -1).join('/') || '/',
    tail: nomalizePath.split('/').pop() || '',
    path: nomalizePath || '/',
  };
}
function createReturnXml(uriPath, davStatus, statusText) {
  return `<?xml version="1.0" encoding="utf-8"?>
  <d:multistatus xmlns:d="DAV:">
    <d:response>
      <d:href>${uriPath.split('/').map(encodeURIComponent).join('/')}</d:href>
      <d:status>HTTP/1.1 ${davStatus} ${statusText}</d:status>
    </d:response>
  </d:multistatus>`;
}
function createPropfindXml(parent, files) {
  if (parent === '/') parent = '';
  const encodedParent = parent.split('/').map(encodeURIComponent).join('/');
  const xmlParts = ['<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus xmlns:d="DAV:">\n'];
  for (const child of files) {
    xmlParts.push(createResourceXml(encodedParent, child, !child.file));
  }
  xmlParts.push('</d:multistatus>');
  return xmlParts.join('');
}
function createResourceXml(encodedParent, resource, isDirectory) {
  const encodedName = resource.name ? `/${encodeURIComponent(resource.name)}` : '';
  const modifiedDate = new Date(resource.lastModifiedDateTime).toUTCString();
  return `
<d:response>
    <d:href>${encodedParent}${encodedName}${isDirectory ? '/' : ''}</d:href>
    <d:propstat>
      <d:prop>
        ${isDirectory ? '<d:resourcetype><d:collection/></d:resourcetype>' : '<d:resourcetype/>'}
        <d:getcontenttype>${isDirectory ? 'httpd/unix-directory' : 'application/octet-stream'}</d:getcontenttype>
        <d:getcontentlength>${resource.size}</d:getcontentlength>
        <d:getlastmodified>${modifiedDate}</d:getlastmodified>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
`;
}

// back-end-cf/services/davMethod.ts
async function handlePropfind(filePath) {
  const { path: fetchPath } = davPathSplit(filePath);
  const allFiles = [];
  const skipTokens = [];
  const currentTokens = await fetchSaveSkipToken(fetchPath);
  const uriPath =
    fetchPath === `/` ? PROTECTED.EXPOSE_PATH : `:${PROTECTED.EXPOSE_PATH}${fetchPath}:`;
  const baseUrl = `/me/drive/root${uriPath}/children?select=name,size,lastModifiedDateTime,file&top=1000`;
  const createListRequest = (id, skipToken) => ({
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
        url: `/me/drive/root${uriPath}?select=name,size,lastModifiedDateTime,file`,
        headers: { 'Content-Type': 'application/json' },
        body: {},
      },
      createListRequest('2'),
      ...currentTokens.map((token, index) => createListRequest(`${index + 3}`, token)),
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
    if (resp.id === '1') {
      allFiles.push({
        ...resp.body,
        name: resp.body.file ? resp.body.name : '',
      });
      continue;
    }
    const items = resp.body.value;
    items.map((item) => {
      allFiles.push(item);
    });
    const nextLink = resp.body['@odata.nextLink'];
    const skipToken = nextLink ? new URL(nextLink).searchParams.get('$skiptoken') : void 0;
    if (skipToken) {
      skipTokens.push(skipToken);
    }
  }
  await fetchSaveSkipToken(fetchPath, skipTokens);
  const responseXML = createPropfindXml(fetchPath, allFiles);
  return { davXml: responseXML, davStatus: 207 };
}
async function handleCopyMove(filePath, method, destination) {
  if (!destination) {
    return {
      davXml: createReturnXml(filePath, 400, 'Missing destination'),
      davStatus: 400,
    };
  }
  const { parent, path: uriPath } = davPathSplit(filePath);
  const uri =
    `${OAUTH.apiUrl}:${encodeURIComponent(PROTECTED.EXPOSE_PATH + uriPath)}` +
    (method === 'COPY' ? ':/copy' : '');
  const { parent: newParent, tail: newTail } = davPathSplit(destination);
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
  return { davXml: responseXML, davStatus };
}
async function handleDelete(filePath) {
  const uriPath = davPathSplit(filePath).path;
  const uri = `${OAUTH.apiUrl}:${encodeURIComponent(PROTECTED.EXPOSE_PATH + uriPath)}`;
  const res = await fetchWithAuth(uri, { method: 'DELETE' });
  const davStatus = res.status;
  const responseXML =
    davStatus === 204 ? null : createReturnXml(uriPath, davStatus, res.statusText);
  return { davXml: responseXML, davStatus };
}
async function handleHead(filePath) {
  const uri = [
    OAUTH.apiUrl,
    `:${encodeURIComponent(PROTECTED.EXPOSE_PATH + davPathSplit(filePath).path)}`,
    '?select=size,file,lastModifiedDateTime',
  ].join('');
  const resp = await fetchWithAuth(uri);
  const data = await resp.json();
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
async function handleMkcol(filePath) {
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
  return { davXml: responseXML, davStatus };
}
async function handlePut(filePath, request) {
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
  const initialDelay = 2e3;
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
      const jsonData = await data.json();
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
    newStart = void 0;
  }
  return { davXml: null, davStatus: 201 };
}

// back-end-cf/handlers/dav-handler.ts
async function handleWebdav(filePath, request, davCredentials) {
  const davAuth = authenticateWebdav(request.headers.get('Authorization'), davCredentials);
  if (!davAuth) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="WebDAV"',
      },
    });
  }
  const handlers = {
    HEAD: () => handleHead(filePath),
    COPY: () => handleCopyMove(filePath, 'COPY', request.headers.get('Destination')),
    MOVE: () => handleCopyMove(filePath, 'MOVE', request.headers.get('Destination')),
    DELETE: () => handleDelete(filePath),
    MKCOL: () => handleMkcol(filePath),
    PUT: () => handlePut(filePath, request),
    PROPFIND: () => handlePropfind(filePath),
  };
  const handler = handlers[request.method];
  const davRes = handleDavRes(await handler(), request);
  return new Response(davRes.davXml, {
    status: davRes.davStatus,
    headers: davRes.davHeaders,
  });
}
function handleDavRes(davRes, request) {
  const davHeaders = {
    ...(davRes.davXml ? { 'Content-Type': 'application/xml; charset=utf-8' } : {}),
    ...(davRes.davHeaders || {}),
  };
  const proxyDownload = new URL(request.url).pathname.startsWith(`/${PROTECTED.PROXY_KEYWORD}`);
  const davXml =
    proxyDownload && davRes.davXml
      ? davRes.davXml.replaceAll('<d:href>', `<d:href>/${PROTECTED.PROXY_KEYWORD}`)
      : davRes.davXml;
  const davStatus = davRes.davStatus;
  return { davXml, davStatus, davHeaders };
}

// back-end-cf/handlers/post-handler.ts
async function handlePostRequest(request, env, requestUrl) {
  const returnHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'max-age=3600',
    'Content-Type': 'application/json; charset=utf-8',
  };
  const body = await request.json();
  const requestPath = decodeURIComponent(body.path || '');
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

// back-end-cf/handlers/request-handler.ts
async function cacheRequest(request, env, ctx) {
  const CACHE_TTLMAP = env.PROTECTED?.CACHE_TTLMAP || PROTECTED.CACHE_TTLMAP;
  const requestMethod = request.method;
  if (CACHE_TTLMAP[requestMethod]) {
    const keyGenerators = {
      GET: () => request.url.toLowerCase(),
      POST: async () => await request.clone().text(),
    };
    const cacheKeySource = await keyGenerators[requestMethod]();
    const hash = await sha256(cacheKeySource);
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = `/${requestMethod}` + cacheUrl.pathname + hash;
    const cacheKey = new Request(cacheUrl.toString(), {
      method: 'GET',
    });
    const cache = caches.default;
    let response = await cache.match(cacheKey);
    const LastModified = response?.headers.get('Last-Modified') || 0;
    const cacheModifiedTime = new Date(LastModified).getTime();
    const isExpired = (Date.now() - cacheModifiedTime) / 1e3 > CACHE_TTLMAP[requestMethod];
    if (!response || isExpired) {
      response = await handleRequest(request, env);
      if ([200, 302].includes(response.status)) {
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      }
    }
    return response;
  }
  return handleRequest(request, env);
}
async function handleRequest(request, env) {
  const requestUrl = new URL(request.url);
  const proxyDownload =
    requestUrl.searchParams.has(PROTECTED.PROXY_KEYWORD) ||
    requestUrl.pathname.startsWith(`/${PROTECTED.PROXY_KEYWORD}/`);
  const file =
    requestUrl.searchParams.get('file') ||
    decodeURIComponent(requestUrl.pathname.replace(`/${PROTECTED.PROXY_KEYWORD}/`, '/'));
  const handlers = {
    // Preflight
    OPTIONS: () => {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          DAV: '1, 3',
        },
      });
    },
    // Download a file
    GET: () => {
      const fileName = file.split('/').pop();
      if (!fileName) return new Response('Bad Request', { status: 400 });
      if (fileName.toLowerCase() === PROTECTED.PASSWD_FILENAME.toLowerCase()) {
        return new Response('Access Denied', { status: 403 });
      }
      return downloadFile(file, proxyDownload, requestUrl.searchParams.get('format'));
    },
    // Upload and List files
    POST: () => handlePostRequest(request, env, requestUrl),
  };
  const handler = handlers[request.method];
  if (handler) {
    return handler();
  }
  const davMethods = ['COPY', 'DELETE', 'HEAD', 'MKCOL', 'MOVE', 'PROPFIND', 'PUT'];
  if (davMethods.includes(request.method)) {
    return handleWebdav(file, request, env.WEBDAV);
  } else {
    return new Response(null, { status: 405 });
  }
}

// back-end-cf/index.ts
var index_default = {
  async fetch(request, env, ctx) {
    try {
      return cacheRequest(request, env, ctx);
    } catch (e) {
      return Response.json({ error: e.message });
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(fetchAccessToken(env.OAUTH, env.FODI_CACHE));
  },
};
export { index_default as default };
