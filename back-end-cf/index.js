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

async function handleRequest(request) {
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
  if (file) {
    const fileName = file.split('/').pop();
    if (fileName.toLowerCase() === PASSWD_FILENAME.toLowerCase()) {
      throw new Error('access denied');
    }
    return downloadFile(file, requestUrl.searchParams.get('format'));
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

    await authenticate(requestPath, body.passwd);

    if (
      !allowUpload ||
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

async function authenticate(path, passwd) {
  const pwFileContent = await downloadFile(
    `${path}/${PASSWD_FILENAME}`,
    null,
    true
  )
    .then((resp) => (resp.status === 401 ? cacheFetch(resp.url) : resp))
    .then((resp) => (resp.status === 404 ? undefined : resp.text()));

  if (pwFileContent) {
    if (passwd !== pwFileContent) {
      throw new Error('wrong password');
    }
  } else if (path !== '/' && path.split('/').length <= PROTECTED_LAYERS) {
    return authenticate('/', passwd);
  }
}

async function fetchFiles(path, passwd, skipToken, orderby) {
  const parent = path || '/';
  try {
    await authenticate(path, passwd);
  } catch (_) {
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
    throw new Error('request failed');
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
