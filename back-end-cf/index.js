/**
 * EXPOSE_PATH：暴露路径，如全盘展示请留空，否则按 '/媒体/音乐' 的格式填写
 * ONEDRIVE_REFRESHTOKEN: refresh_token
 * PASSWD_FILENAME: 密码文件名
 * PROTECTED_LAYERS: EXPOSE_PATH 目录密码防护层数，防止猜测目录，默认 -1 为关闭，类似 '/Applications' 需要保护填写为 2（保护 EXPOSE_PATH 及其一级子目录），开启需在 EXPORSE_PATH 目录的 PASSWORD_FILENAME 文件中填写密码
 */
const EXPOSE_PATH = '';
const ONEDRIVE_REFRESHTOKEN = '';
const PASSWD_FILENAME = '.password';
const PROTECTED_LAYERS = -1;

addEventListener('scheduled', (event) => {
  event.waitUntil(fetchAccessToken());
});

addEventListener('fetch', (event) => {
  event.respondWith(
    handleRequest(event.request).catch((e) =>
      Response.json({ error: e.message })
    )
  );
});

const OAUTH = {
  redirectUri: redirectUri,
  refreshToken: ONEDRIVE_REFRESHTOKEN,
  clientId: clientId,
  clientSecret: clientSecret,
  oauthUrl: loginHost + '/common/oauth2/v2.0/',
  apiUrl: apiHost + '/v1.0/me/drive/root',
  scope: apiHost + '/Files.ReadWrite.All offline_access',
};

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
}

async function handleRequest(request, env) {
  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const requestUrl = new URL(request.url);
  const file =
    requestUrl.searchParams.get('file') ||
    (requestUrl.pathname.split('/').filter(Boolean).length === 0
      ? ''
      : decodeURIComponent(requestUrl.pathname));

  // Download a file
  if (request.method === 'GET' && file) {
    const fileName = file.split('/').pop();
    if (fileName.toLowerCase() === PASSWD_FILENAME.toLowerCase()) {
      throw new Error('access denied');
    }
    return downloadFile(file, requestUrl.searchParams.get('format'));
  }

  // Webdav
  const davMethods = ['COPY', 'DELETE', 'MKCOL', 'MOVE', 'PROPFIND', 'PROPPATCH', 'PUT'];
  if (davMethods.includes(request.method)) {
    const davHeader = request.headers;
    const davAuth = await authenticate(null, null, davHeader.get('Authorization'), env.WEBDAV);
    if (!davAuth) {
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="WebDAV"',
        },
      });
    }
    const davRes = await handleWebdav(file, request.method, request);
    return new Response(davRes.davXml, {
      status: davRes.davStatus,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    });
  }

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
          PASSWD_FILENAME.toLowerCase()
      )
    ) {
      throw new Error('access denied');
    }

    const uploadLinks = await uploadFiles(body.files);
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
  ) : JSON.stringify({
    requestPath,
    files: [],
    encrypted: true,
  });
  return new Response(files, {
    headers: returnHeaders,
  });
}

async function gatherResponse(response) {
  const { headers } = response;
  const contentType = headers.get('content-type');
  if (contentType.includes('application/json')) {
    return await response.json();
  }
  return await response.text();
}

async function cacheFetch(url, options) {
  return fetch(new Request(url, options), {
    cf: {
      cacheTtl: 3600,
      cacheEverything: true,
    },
  });
}

async function getContent(url, headers) {
  const response = await cacheFetch(url, { headers });
  const result = await gatherResponse(response);
  return result;
}

async function postFormData(url, data) {
  const formData = new FormData();
  for (const key in data) {
    formData.append(key, data[key]);
  }
  const requestOptions = {
    method: 'POST',
    body: formData,
  };
  const response = await cacheFetch(url, requestOptions);
  const result = await gatherResponse(response);
  return result;
}

async function fetchAccessToken() {
  let refreshToken = OAUTH['refreshToken'];
  if (typeof FODI_CACHE !== 'undefined') {
    const cache = JSON.parse(await FODI_CACHE.get('token_data'));
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

  if (typeof FODI_CACHE !== 'undefined' && result?.refresh_token) {
    result.save_time = Date.now();
    await FODI_CACHE.put('token_data', JSON.stringify(result));
  }
  return result.access_token;
}

async function authenticate(path, passwd, davAuthHeader, WEBDAV) {
  if (davAuthHeader) {
    const encoder = new TextEncoder();
    const header = encoder.encode(davAuthHeader);
    const isValid = Object.entries(JSON.parse(WEBDAV)).some(([key, value]) => {
      const expected = encoder.encode(`Basic ${btoa(`${key}:${value}`)}`);
      return header.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(header, expected);
    });
    return isValid;
  }

  const pwFileContent = await downloadFile(
    `${path}/${PASSWD_FILENAME}`,
    null,
    true
  )
    .then((resp) => (resp.status === 401 ? cacheFetch(resp.url) : resp))
    .then((resp) => (resp.status === 404 ? undefined : resp.text()));

  if (pwFileContent) {
    return passwd === pwFileContent;
  } else if (path !== '/' && path.split('/').length <= PROTECTED_LAYERS) {
    return authenticate('/', passwd);
  }
  return true;
}

async function fetchFiles(path, skipToken, orderby) {
  const parent = path || '/';

  if (path === '/') path = '';
  if (path || EXPOSE_PATH) {
    // if EXPOSE_PATH + path equals to an empty string, ':' will lead to an error.
    path = ':' + encodeURIComponent(EXPOSE_PATH + path) + ':';
  }
  const accessToken = await fetchAccessToken();
  const expand = [
    '/children?select=name,size,parentReference,lastModifiedDateTime,@microsoft.graph.downloadUrl',
    orderby ? `&orderby=${encodeURIComponent(orderby)}` : '',
    skipToken ? `&skiptoken=${skipToken}` : '',
  ].join('');
  const uri = OAUTH.apiUrl + path + expand;

  const pageRes = await getContent(uri, {
    Authorization: 'Bearer ' + accessToken,
  });
  if (pageRes.error) {
    return JSON.stringify({
      error: 'request failed'
    });
  }

  skipToken = pageRes['@odata.nextLink']
    ? new URL(pageRes['@odata.nextLink']).searchParams.get('$skiptoken')
    : undefined;
  const children = pageRes.value;

  return JSON.stringify({
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
      .filter((file) => file.name !== PASSWD_FILENAME),
  });
}

async function downloadFile(filePath, format, stream) {
  const supportedFormats = ['glb', 'html', 'jpg', 'pdf'];
  if (format && !supportedFormats.includes(format.toLowerCase())) {
    throw new Error('unsupported target format');
  }

  filePath = encodeURIComponent(`${EXPOSE_PATH}${filePath}`);
  const uri =
    `${OAUTH.apiUrl}:${filePath}:/content` +
    (format ? `?format=${format}` : '') +
    (format === 'jpg' ? '&width=30000&height=30000' : '');
  const accessToken = await fetchAccessToken();

  return cacheFetch(uri, {
    redirect: stream ? 'follow' : 'manual',
    headers: {
      Authorization: 'Bearer ' + accessToken,
    },
  });
}

async function uploadFiles(fileList) {
  const batchRequest = {
    requests: fileList.map((file, index) => ({
      id: `${index + 1}`,
      method: file['fileSize'] ? 'POST' : 'PUT',
      url: `/me/drive/root:${encodeURI(EXPOSE_PATH + file['remotePath'])}${
        file['fileSize'] ? ':/createUploadSession' : ':/content'
      }`,
      headers: { 'Content-Type': 'application/json' },
      body: {},
    })),
  };
  const accessToken = await fetchAccessToken();
  const batchResponse = await cacheFetch(`${apiHost}/v1.0/$batch`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(batchRequest),
  });
  const batchResult = await batchResponse.json();
  batchResult.responses.forEach((response) => {
    if (response.status === 200) {
      const index = parseInt(response.id) - 1;
      fileList[index].uploadUrl = response.body.uploadUrl;
    }
  });
  return JSON.stringify({ files: fileList });
}

async function handleWebdav(filePath, method, request) {
  if (method === 'COPY' || method === 'MOVE') {
    return await handleCopyMove(filePath, method, request.headers.get('Destination'));
  }
  if (method === 'DELETE') {
    return await handleDelete(filePath);
  }
  if (method === 'MKCOL') {
    return await handleMkcol(filePath);
  }
  if (method === 'PUT') {
    return await handlePut(filePath, request);
  }
  return await handlePropfind(filePath);
}

function davPathSplit(filePath) {
  filePath = filePath.includes('://') 
    ? new URL(filePath).pathname
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

function createPropfindXml(parent, files, isDirectory){
  if (parent === '/') parent = '';
  parent = parent.split('/').map(encodeURIComponent).join('/');
  const xmlHeader = '<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus xmlns:d="DAV:">\n';
  const currentDirXml = 
  `\n<d:response>
    <d:href>${parent}/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <d:getcontentlength>0</d:getcontentlength>
        <d:getlastmodified></d:getlastmodified>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>\n`;

  let fullXml = xmlHeader + (isDirectory ? currentDirXml : '');
  if (!files) {
    fullXml += '</d:multistatus>';
    return fullXml;
  }

  for (const file of files) {
    const isDir = !file.url;
    const modifiedDate = new Date(file.lastModifiedDateTime).toUTCString();
    const fileXml = 
    `\n<d:response>
      <d:href>${parent}/${encodeURIComponent(file.name)}${isDir ? '/' : ''}</d:href>
      <d:propstat>
        <d:prop>
          <d:resourcetype>${isDir ? '<d:collection/>' : ''}</d:resourcetype>
          <d:getcontentlength>${file.size}</d:getcontentlength>
          <d:getlastmodified>${modifiedDate}</d:getlastmodified>
        </d:prop>
        <d:status>HTTP/1.1 200 OK</d:status>
      </d:propstat>
    </d:response>\n`;
    fullXml += fileXml;
  }
  fullXml += '</d:multistatus>';
  return fullXml;
}

async function handleCopyMove(filePath, method, destination){
  const uriPath = davPathSplit(filePath).path;
  const uri = `${OAUTH.apiUrl}:${encodeURIComponent(EXPOSE_PATH + uriPath)}` + (method === 'COPY' ? ':/copy' : '');
  const accessToken = await fetchAccessToken();
  const newParent = davPathSplit(destination).parent;

  const res = await cacheFetch(uri, {
    method: method === 'COPY' ? 'POST' : 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parentReference: {
        path: `/drive/root:${EXPOSE_PATH}${newParent}`
      }
    })
  });

  const davStatus = res.status === 200 ? 201 : res.status;
  const responseXML = createReturnXml(uriPath, davStatus, res.statusText);

  return {
    davXml: responseXML,
    davStatus: davStatus
  };
}

async function handleDelete(filePath){
  const uriPath = davPathSplit(filePath).path;
  const uri = `${OAUTH.apiUrl}:${encodeURIComponent(EXPOSE_PATH + uriPath)}`;
  const accessToken = await fetchAccessToken();

  const res = await cacheFetch(uri, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    }
  });

  const davStatus = res.status === 204 ? 207 : res.status;
  const responseXML = davStatus === 204
    ? createReturnXml(uriPath, 207, res.statusText)
    : createReturnXml(uriPath, davStatus, res.statusText);

  return {
    davXml: responseXML,
    davStatus: davStatus
  };
}

async function handleMkcol(filePath){
  const uriPath = davPathSplit(filePath).parent;
  const uri = `${OAUTH.apiUrl}:${encodeURIComponent(EXPOSE_PATH + uriPath)}:/children`;
  const accessToken = await fetchAccessToken();

  const res = await cacheFetch(uri, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: davPathSplit(filePath).tail,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename"
    })
  });

  const davStatus = res.status;
  const responseXML = createReturnXml(uriPath, davStatus, res.statusText);

  return {
    davXml: responseXML,
    davStatus: davStatus
  };
}

async function handlePropfind(filePath) {
  const {parent, tail, isDirectory, path } = davPathSplit(filePath);
  const fetchPath = isDirectory ? path : parent;
  const fetchData = JSON.parse(
    await fetchFiles(fetchPath, null, null)
  );

  const notFound = fetchData.error || 
    (!isDirectory && fetchData.files.every(file => file.name !== tail));
  if (notFound) {
    return {
      davXml: createReturnXml(path, 404, 'Not Found'),
      davStatus: 404
    }
  }

  const sourceFiles = isDirectory 
    ? fetchData.files 
    : fetchData.files.filter(file => file.name === tail);
  const responseXML = createPropfindXml(fetchPath, sourceFiles, isDirectory);
  return {
    davXml: responseXML,
    davStatus: 207
  };
}

async function handlePut(filePath, request) {
  const fileLength = parseInt(request.headers.get('Content-Length'));
  if (fileLength > 1024 * 1024 * 100) {
    return {
      davXml: createReturnXml(filePath, 413, 'Cloudflare Size Limit'),
      davStatus: 413,
    };
  }

  const body = await request.arrayBuffer();
  const uploadList = [{
    remotePath: filePath,
    fileSize: fileLength,
  }];
  const uploadUrl = JSON.parse(await uploadFiles(uploadList)).files[0].uploadUrl;

  const chunkSize = 1024 * 1024 * 10;
  let start = 0, newStart, retryCount = 0;
  const maxRetries = 3;
  const initialDelay = 4000;

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
      const data = await cacheFetch(uploadUrl);
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

  return {
    davXml: createReturnXml(filePath, 201, 'Created'),
    davStatus: 201,
  };
}