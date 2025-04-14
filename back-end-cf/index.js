import {env as globalEnv} from "cloudflare:workers";
// jsonc no need JSON.parse, but toml need
const PROTECTED = globalEnv.PROTECTED, OAUTH = globalEnv.OAUTH;

export default {
  async fetch(request, env, ctx) {
    try {
      return cacheRequest(request, env, ctx);
    } catch (e) {
      return Response.json({ error: e.message });
    }
  },

  async scheduled(event, env, ctx) {
    event.waitUntil(fetchAccessToken());
  }
}

async function cacheRequest(request, env, ctx) {
  async function sha256(message) {
    const msgBuffer = await new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return [...new Uint8Array(hashBuffer)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  const CACHE_TTLMAP = env.CACHE_TTLMAP;
  if (CACHE_TTLMAP[request.method]) {
    const keyGenerators = {
      GET: () => request.url.toLowerCase(),
      POST: async () => await request.clone().text(),
      PROPFIND: () => request.url.toLowerCase() + request.headers.get('Authorization')
    };
    const cacheKeySource = await keyGenerators[request.method]();
    const hash = await sha256(cacheKeySource);
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = `/${request.method}` + cacheUrl.pathname + hash;
    const cacheKey = new Request(cacheUrl.toString(), {
      method: 'GET',
    });

    const cache = caches.default;
    let response = await cache.match(cacheKey);
    const cacheModifiedTime = new Date(response?.headers.get('Date')).getTime() || 0;
    const isExpired = cacheModifiedTime === 0 ||
      ((Date.now() - cacheModifiedTime) / 1000) > CACHE_TTLMAP[request.method];

    if (isExpired) {
      response = await handleRequest(request, env);
      if ([200, 207, 302].includes(response.status)) {
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      }
    }

    return response;
  }
  return handleRequest(request, env);
}

async function handleRequest(request, env) {
  const requestUrl = new URL(request.url);
  const file = requestUrl.searchParams.get('file') || decodeURIComponent(requestUrl.pathname);
  const davMethods = ['COPY', 'DELETE', 'HEAD', 'MKCOL', 'MOVE', 'PROPFIND', 'PROPPATCH', 'PUT'];

  const handlers = {
    // Preflight
    OPTIONS: () => {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          'DAV': '1, 3',
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
      return downloadFile(
        file,
        requestUrl.searchParams.get('format'),
        requestUrl.searchParams.has('stream')
      );
    },
    // Upload and List files
    POST: () => handlePostRequest(request, requestUrl),
  };

  const handler = handlers[request.method] ||
    ( davMethods.includes(request.method)
     ? () => handleWebdav(file, request, env.WEBDAV)
     : () => new Response('Method Not Allowed', { status: 405 }) );

  return handler();
}

async function fetchWithAuth(uri, options = {}) {
  const accessToken = await fetchAccessToken();
  return fetch(uri, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
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

async function fetchAccessToken() {
  let refreshToken = OAUTH['refreshToken'];
  if (typeof globalEnv.FODI_CACHE !== 'undefined') {
    const cache = JSON.parse(await globalEnv.FODI_CACHE.get('token_data'));
    if (cache?.refresh_token) {
      const passedMilis = Date.now() - cache.save_time;
      if (passedMilis / 1000 < cache.expires_in - 600) {
        return cache.access_token;
      }

      if (passedMilis < 6912000000) {
        refreshToken = cache.refresh_token;
      }
    }
  }

  const url = OAUTH['oauthUrl'] + 'token';
  const data = {
    client_id: OAUTH['clientId'],
    client_secret: OAUTH['clientSecret'],
    grant_type: 'refresh_token',
    requested_token_use: 'on_behalf_of',
    refresh_token: refreshToken,
  };
  const result = await postFormData(url, data);

  if (typeof globalEnv.FODI_CACHE !== 'undefined' && result?.refresh_token) {
    result.save_time = Date.now();
    await globalEnv.FODI_CACHE.put('token_data', JSON.stringify(result));
  }
  return result.access_token;
}

async function authenticate(path, passwd, davAuthHeader, davCredentials) {
  if (davAuthHeader) {
    const encoder = new TextEncoder();
    const header = encoder.encode(davAuthHeader);
    const expected = encoder.encode(`Basic ${btoa(davCredentials)}`);
    return header.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(header, expected);
  }

  const pwFileContent = await downloadFile(
    `${path}/${PROTECTED.PASSWD_FILENAME}`,
    null,
    true
  ).then((resp) => (resp.status === 404 ? undefined : resp.text()));

  if (pwFileContent) {
    return passwd === pwFileContent;
  } else if (path !== '/' && path.split('/').length <= PROTECTED.PROTECTED_LAYERS) {
    return await authenticate('/', passwd);
  }
  return true;
}

async function handlePostRequest(request, requestUrl) {
  const returnHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'max-age=3600',
    'Content-Type': 'application/json; charset=utf-8',
  };
  const body = await request.json();
  const requestPath = decodeURIComponent(body.path || '');

  // Upload files
  if (requestUrl.searchParams.has('upload')) {
    const allowUpload =
      (await downloadFile(`${requestPath}/.upload`)).status === 302;

    const uploadAuth = await authenticate(requestPath, body.passwd);

    if (
      !allowUpload || !uploadAuth ||
      body.files.some(
        (file) =>
          file.remotePath.split('/').pop().toLowerCase() ===
          PROTECTED.PASSWD_FILENAME.toLowerCase()
      )
    ) {
      throw new Error('access denied');
    }

    const uploadLinks = JSON.stringify(await uploadFiles(body.files));
    return new Response(uploadLinks, {
      headers: returnHeaders,
    });
  }

  // List a folder
  const listAuth = await authenticate(requestPath, body.passwd);
  const files = listAuth ? await fetchFiles(
    requestPath,
    body.skipToken,
    body.orderby
  ) : {
    parent: requestPath,
    files: [],
    encrypted: true,
  };
  return new Response(JSON.stringify(files), {
    status: files?.error ? files.status : 200,
    headers: returnHeaders,
  });
}

async function fetchFiles(path, skipToken, orderby) {
  const parent = path || '/';

  if (path === '/') path = '';
  if (path || PROTECTED.EXPOSE_PATH) {
    // if PROTECTED.EXPOSE_PATH + path equals to an empty string, ':' will lead to an error.
    path = ':' + encodeURIComponent(PROTECTED.EXPOSE_PATH + path) + ':';
  }
  const expand = [
    '/children?select=name,size,parentReference,lastModifiedDateTime,@microsoft.graph.downloadUrl',
    orderby ? `&orderby=${encodeURIComponent(orderby)}` : '',
    skipToken ? `&skiptoken=${skipToken}` : '',
  ].join('');
  const uri = OAUTH.apiUrl + path + expand;

  const pageRes = await (await fetchWithAuth(uri)).json();
  if (pageRes.error) {
    return {
      status: pageRes.status,
      error: 'request failed'
    };
  }

  skipToken = pageRes['@odata.nextLink']
    ? new URL(pageRes['@odata.nextLink']).searchParams.get('$skiptoken')
    : undefined;
  const children = pageRes.value;

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

async function downloadFile(filePath, format, stream) {
  const supportedFormats = ['glb', 'html', 'jpg', 'pdf'];
  if (format && !supportedFormats.includes(format.toLowerCase())) {
    throw new Error('unsupported target format');
  }

  filePath = encodeURIComponent(`${PROTECTED.EXPOSE_PATH}${filePath}`);
  const uri =
    `${OAUTH.apiUrl}:${filePath}:/content` +
    (format ? `?format=${format}` : '') +
    (format === 'jpg' ? '&width=30000&height=30000' : '');

  if (stream) {
    const res = await fetchWithAuth(uri);
    const fileRes = res.status === 401 ? await fetch(res.url) : res;
    return new Response(fileRes.body, {
      status: fileRes.status,
      headers: {
        'Content-Type': fileRes.headers.get('Content-Type')
      }
    });
  }

  return fetchWithAuth(uri, { redirect: 'manual' });
}

async function uploadFiles(fileList) {
  const batchRequest = {
    requests: fileList.map((file, index) => ({
      id: `${index + 1}`,
      method: file['fileSize'] ? 'POST' : 'PUT',
      url: `/me/drive/root:${encodeURI(PROTECTED.EXPOSE_PATH + file['remotePath'])}${
        file['fileSize'] ? ':/createUploadSession' : ':/content'
      }`,
      headers: { 'Content-Type': 'application/json' },
      body: {},
    })),
  };
  const batchResponse = await fetchWithAuth(`${OAUTH.apiHost}/v1.0/$batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batchRequest),
  });
  const batchResult = await batchResponse.json();
  batchResult.responses.forEach((response) => {
    if (response.status === 200) {
      const index = parseInt(response.id) - 1;
      fileList[index].uploadUrl = response.body.uploadUrl;
    }
  });
  return { files: fileList };
}

async function handleWebdav(filePath, request, davCredentials) {
  const davAuth = await authenticate(null, null, request.headers.get('Authorization'), davCredentials);
  if (!davAuth) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="WebDAV"',
      },
    });
  }

  if (request.method === 'HEAD') return handleHead(filePath);

  const handlers = {
    COPY: () => handleCopyMove(filePath, 'COPY', request.headers.get('Destination')),
    MOVE: () => handleCopyMove(filePath, 'MOVE', request.headers.get('Destination')),
    DELETE: () => handleDelete(filePath),
    MKCOL: () => handleMkcol(filePath),
    PUT: () => handlePut(filePath, request),
    PROPFIND: () => handlePropfind(filePath),
  };
  const handler = handlers[request.method] || (() => ({ davXml: null, davStatus: 405 }));
  const davRes = await handler();

  return new Response(davRes.davXml, {
    status: davRes.davStatus,
    headers: davRes.davXml
      ? { 'Content-Type': 'application/xml; charset=utf-8' }
      : {}
  });
}

function davPathSplit(filePath) {
  filePath = filePath.includes('://') 
    ? decodeURIComponent(new URL(filePath).pathname)
    : filePath;
  if (!filePath) filePath = '/';
  const isDirectory = filePath.endsWith('/');
  const nomalizePath = isDirectory ? filePath.slice(0, -1) : filePath;
  return {
    parent: nomalizePath.split('/').slice(0, -1).join('/') || '/',
    tail: nomalizePath.split('/').pop(),
    isDirectory: isDirectory,
    path: nomalizePath || '/'
  };
}

function createReturnXml(uriPath, davStatus, statusText){
  return`<?xml version="1.0" encoding="utf-8"?>
  <d:multistatus xmlns:d="DAV:">
    <d:response>
      <d:href>${uriPath.split('/').map(encodeURIComponent).join('/')}</d:href>
      <d:status>HTTP/1.1 ${davStatus} ${statusText}</d:status>
    </d:response>
  </d:multistatus>`;
}

function createPropfindXml(parent, files, isDirectory) {
  if (parent === '/') parent = '';
  const encodedParent = parent.split('/').map(encodeURIComponent).join('/');
  const xmlParts = [
    '<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus xmlns:d="DAV:">\n'
  ];

  if (isDirectory) {
    const directory = {
      name: '',
      size: 0,
      lastModifiedDateTime: 0
    };
    xmlParts.push(createResourceXml(encodedParent, directory, true));
  }

  if (files) {
    for (const file of files) {
      xmlParts.push(createResourceXml(encodedParent, file, !file.url));
    }
  }

  xmlParts.push('</d:multistatus>');
  return xmlParts.join('');
}

function createResourceXml(encodedParent, resource, isDirectory) {
  const encodedName = resource.name ? `/${encodeURIComponent(resource.name)}` : '';
  const modifiedDate = new Date(resource.lastModifiedDateTime).toUTCString();
  return `\n<d:response>
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
  </d:response>\n`;
}

async function handleCopyMove(filePath, method, destination){
  const { parent: parent, path: uriPath } = davPathSplit(filePath);
  const uri = `${OAUTH.apiUrl}:${encodeURIComponent(PROTECTED.EXPOSE_PATH + uriPath)}` + (method === 'COPY' ? ':/copy' : '');
  const { parent: newParent, tail: newTail } = davPathSplit(destination);

  const res = await fetchWithAuth(uri, {
    method: method === 'COPY' ? 'POST' : 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      newParent === parent
        ? { name: newTail }
        : { parentReference: { path: `/drive/root:${PROTECTED.EXPOSE_PATH}${newParent}` } }
    )
  });

  const davStatus = res.status === 200 ? 201 : res.status;
  const responseXML = davStatus === 201
    ? null
    : createReturnXml(uriPath, davStatus, res.statusText);

  return { davXml: responseXML, davStatus: davStatus };
}

async function handleDelete(filePath){
  const uriPath = davPathSplit(filePath).path;
  const uri = `${OAUTH.apiUrl}:${encodeURIComponent(PROTECTED.EXPOSE_PATH + uriPath)}`;

  const res = await fetchWithAuth(uri, { method: 'DELETE' });
  const davStatus = res.status;
  const responseXML = davStatus === 204
    ? null
    : createReturnXml(uriPath, davStatus, res.statusText);

  return { davXml: responseXML, davStatus: davStatus };
}

async function handleHead(filePath) {
  const uri = [
    OAUTH.apiUrl,
    `:${encodeURIComponent(PROTECTED.EXPOSE_PATH + davPathSplit(filePath).path)}`,
    '?select=size,file,lastModifiedDateTime'
  ].join('');
  const res = await fetchWithAuth(uri);
  const data = await res.json();

  return new Response(null, {
    status: data?.file ? 200 : 403,
    headers: data?.file ? {
      'Content-Length': data.size,
      'Content-Type': data.file.mimeType,
      'Last-Modified': new Date(data.lastModifiedDateTime).toUTCString()
    } : {}
  });
}

async function handleMkcol(filePath){
  const { parent, tail } = davPathSplit(filePath);
  const uri = `${OAUTH.apiUrl}:${encodeURIComponent(PROTECTED.EXPOSE_PATH + parent)}:/children`;

  const res = await fetchWithAuth(uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: tail,
      folder: {},
      "@microsoft.graph.conflictBehavior": "replace"
    })
  });

  const davStatus = res.status === 200 ? 201 : res.status;
  const responseXML = davStatus === 201
    ? null
    : createReturnXml(parent, davStatus, res.statusText);

  return { davXml: responseXML, davStatus: davStatus };
}

async function handlePropfind(filePath) {
  const { parent, tail, isDirectory, path } = davPathSplit(filePath);
  const fetchPath = isDirectory ? path : parent;
  let hasMorePages = true, nextPageToken = null, allFiles = [];

  while (hasMorePages) {
    const fetchData = await fetchFiles(fetchPath, nextPageToken, null);
    if (!fetchData || fetchData.error) {
      return { davXml: null, davStatus: 404 };
    }
    allFiles.push(...fetchData.files);
    nextPageToken = fetchData.skipToken;
    hasMorePages = !!nextPageToken;
  }

  const targetFile = isDirectory ? null : allFiles.find(file => file.name === tail);
  if (!isDirectory && !targetFile) {
    return { davXml: null, davStatus: 404 };
  }

  const sourceFiles = isDirectory ? allFiles : [targetFile];
  const responseXML = createPropfindXml(fetchPath, sourceFiles, isDirectory);

  return { davXml: responseXML, davStatus: 207 };
}

async function handlePut(filePath, request) {
  const fileLength = parseInt(request.headers.get('Content-Length'));
  const body = await request.arrayBuffer();
  const uploadList = [{
    remotePath: filePath,
    fileSize: fileLength,
  }];
  const uploadUrl = (await uploadFiles(uploadList)).files[0].uploadUrl;

  const chunkSize = 1024 * 1024 * 60;
  let start = 0, newStart, retryCount = 0;
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
    newStart = undefined;
  }

  return { davXml: null, davStatus: 201 };
}