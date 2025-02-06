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
const WEBDAV = {
  'admin': 'J2t6a3z8xeCAn3pZqEo9',
};

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

async function handleRequest(request) {
  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND, MOVE',
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
  if (['PROPFIND', 'MOVE', 'DELETE'].includes(request.method)) {
    const davHeader = request.headers;
    const davAuth = await authenticate(null, null, davHeader.get('Authorization'));
    if (!davAuth) {
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="WebDAV"',
        },
      });
    }
    const davRes = JSON.parse(await handleWebdav(file, request.method, davHeader, await request.text()));
    return new Response(davRes.davXml, {
      status: davRes.davStatus,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    })
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
  const files = await fetchFiles(
    requestPath,
    body.passwd,
    body.skipToken,
    body.orderby
  );
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

async function authenticate(path, passwd, davAuthHeader) {
  if (davAuthHeader) {
    const encoder = new TextEncoder();
    for (const [key, value] of Object.entries(WEBDAV)) {
      const header = encoder.encode(davAuthHeader);
      const expected = encoder.encode(`Basic ${btoa(`${key}:${value}`)}`);
      const isVaild = header.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(header, expected);
      if (isVaild) {
        return true;
      }
    }
    return false;
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

async function fetchFiles(path, passwd, skipToken, orderby, davAuthHeader) {
  const parent = path || '/';
  const isAuthenticated = await authenticate(path, passwd, davAuthHeader);
  if (!isAuthenticated) {
    return JSON.stringify({
      parent,
      files: [],
      encrypted: true,
    });
  }

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

async function handleWebdav(filePath, method, davHeader, davBody) {
  if (method === 'MOVE' || method === 'DELETE') {
    return await handleMoveDel(filePath, method, davHeader);
  }
  return await handlePropfind(filePath, davHeader.get('Authorization'));
}

function davPathSplit(filePath) {
  if (!filePath) {
    return {
      parent: '',
      fileName: '',
      isDirectory: true
    }
  }
  const normalizedPath = filePath.endsWith('/') ? filePath.slice(0, -1) : filePath;
  const pathParts = normalizedPath.includes('://') 
    ? new URL(normalizedPath).pathname.split('/') 
    : normalizedPath.split('/');
  return {
    parent: pathParts.slice(0, -1).join('/'),
    fileName: pathParts[pathParts.length - 1],
    isDirectory: filePath.endsWith('/')
  };
}

function createDirectoryXml(path) {
  return `
  <response>
    <href>${path}/</href>
    <propstat>
      <prop>
        <resourcetype><collection/></resourcetype>
        <getcontentlength></getcontentlength>
        <getlastmodified></getlastmodified>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>\n`;
}

function createFileXml(parentPath, file) {
  const isDirectory = !file.url;
  const modifiedDate = new Date(file.lastModifiedDateTime).toUTCString();
  
  return `
    <response>
    <href>${parentPath}/${encodeURIComponent(file.name)}${isDirectory ? '/' : ''}</href>
      <propstat>
        <prop>
        <resourcetype>${isDirectory ? '<collection/>' : ''}</resourcetype>
          <getcontentlength>${file.size}</getcontentlength>
        <getlastmodified>${modifiedDate}</getlastmodified>
        </prop>
        <status>HTTP/1.1 200 OK</status>
      </propstat>
    </response>\n`;
}

async function handlePropfind(filePath, davAuthHeader) {
  const { parent, fileName, isDirectory } = davPathSplit(filePath);
  const fetchPath = parent + (isDirectory ? '/' + fileName : '');
  const filesData = JSON.parse(
    await fetchFiles(fetchPath, null, null, null, davAuthHeader)
  );

  const encodedPath = fetchPath === '/' 
    ? ''
    : fetchPath.split('/').map(encodeURIComponent).join('/');

  if (!isDirectory || filesData.error) {
    return JSON.stringify({ davXml: '', davStatus: 404 });
  }

  const xmlHeader = '<?xml version="1.0" encoding="utf-8"?>\n<multistatus xmlns="DAV:">\n';
  const currentDirXml = createDirectoryXml(encodedPath);
  const contentsXml = filesData.files
    .map(file => createFileXml(encodedPath, file))
    .join('');
  
  const fullXml = `${xmlHeader}${currentDirXml}${contentsXml}</multistatus>`;

  return JSON.stringify({
    davXml: fullXml,
    davStatus: 207
  });
}

async function handleMoveDel(filePath, method, davHeader) {
  const { parent, fileName } = davPathSplit(filePath);
  const uriPath = `${parent}/${fileName}`;
  const uri = `${OAUTH.apiUrl}:${encodeURIComponent(EXPOSE_PATH + uriPath)}`;
  const accessToken = await fetchAccessToken();

  const headers = {
    Authorization: `Bearer ${accessToken}`
  };

  let requestOptions = {
    method: method === 'MOVE' ? 'PATCH' : 'DELETE',
    headers
  };

  if (method === 'MOVE') {
    const destination = davHeader.get('Destination');
    if (destination) {
      const newPath = davPathSplit(destination).parent;
      headers['Content-Type'] = 'application/json';
      requestOptions.body = JSON.stringify({
        parentReference: {
          path: `/drive/root:${EXPOSE_PATH}${newPath}`
        }
      });
    }
  }

  const res = await cacheFetch(uri, requestOptions);
  const davStatus = res.status === 200 ? 201 : res.status;
  
  const responseXML = `<?xml version="1.0" encoding="utf-8"?>
  <d:multistatus xmlns:d="DAV:">
    <d:response> 
      <d:href>${encodeURIComponent(uriPath)}</d:href>
      <d:status>HTTP/1.1 ${davStatus} ${res.statusText}</d:status>
    </d:response> 
  </d:multistatus>`;

  return JSON.stringify({ 
    davXml: responseXML, 
    davStatus: davStatus 
  });
}
