/**
 * IS_CN: 如果为世纪互联版本，请将 0 改为 1
 * EXPOSE_PATH：暴露路径，如全盘展示请留空，否则按 '/媒体/音乐' 的格式填写
 * ONEDRIVE_REFRESHTOKEN: refresh_token
 * PASSWD_FILENAME: 密码文件名
 * PROTECTED_LAYERS: EXPOSE_PATH 目录密码防护层数，防止猜测目录，默认 -1 为关闭，类似 '/Applications' 需要保护填写为 2（保护 EXPOSE_PATH 及其一级子目录），开启需在 EXPORSE_PATH 目录的 PASSWORD_FILENAME 文件中填写密码
 * EXPOSE_PASSWD: 覆盖 EXPOSE_PATH 目录密码，优先级：本目录密码 > EXPOSE_PASSWD > EXPORSE_PATH 目录密码；填写后访问速度稍快，但不便于更改
 */
const IS_CN = 0;
const EXPOSE_PATH = '';
const ONEDRIVE_REFRESHTOKEN = '';
const PASSWD_FILENAME = '.password';
const PROTECTED_LAYERS = -1;
const EXPOSE_PASSWD = '';

addEventListener('scheduled', (event) => {
  event.waitUntil(fetchAccessToken(/* event.scheduledTime */));
});

addEventListener('fetch', (event) => {
  try {
    return event.respondWith(handleRequest(event.request));
  } catch (e) {
    return event.respondWith(new Response('Error thrown ' + e.message));
  }
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

const PATH_AUTH_STATES = Object.freeze({
  NO_PW_FILE: Symbol('NO_PW_FILE'),
  PW_CORRECT: Symbol('PW_CORRECT'),
  PW_ERROR: Symbol('PW_ERROR'),
});

async function handleRequest(request) {
  let requestPath;
  const returnHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'max-age=3600',
    'Content-Type': 'application/json; charset=utf-8',
  };
  const requestUrl = new URL(request.url);
  const file = requestUrl.searchParams.get('file') || (requestUrl.pathname.split('/').filter(Boolean).length === 0 ? '' : decodeURIComponent(requestUrl.pathname));
  if (file) {
    const fileName = file.split('/').pop();
    if (fileName.toLowerCase() === PASSWD_FILENAME.toLowerCase())
      return Response.redirect(
        'https://www.baidu.com/s?wd=%E6%80%8E%E6%A0%B7%E7%9B%97%E5%8F%96%E5%AF%86%E7%A0%81',
        301
      );
    requestPath = file.replace('/' + fileName, '');
    const url = await fetchFiles(requestPath, fileName);
    return Response.redirect(url, 302);
  } else if (requestUrl.searchParams.get('upload')) {
    requestPath = requestUrl.searchParams.get('upload');
    const uploadAllow = await fetchFiles(requestPath, '.upload');
    const fileList = await request.json();
    const pwAttack = fileList['files'].some(
      (file) =>
        file.remotePath.split('/').pop().toLowerCase() ===
        PASSWD_FILENAME.toLowerCase()
    );
    if (uploadAllow && !pwAttack) {
      const uploadLinks = await uploadFiles(fileList);
      return new Response(uploadLinks, {
        headers: returnHeaders,
      });
    }
    return new Response(JSON.stringify({ error: 'Access forbidden' }), {
      status: 403,
      headers: returnHeaders,
    });
  } else {
    const { headers } = request;
    const contentType = headers.get('content-type');
    const body = {};
    if (contentType && contentType.includes('form')) {
      const formData = await request.formData();
      for (const entry of formData.entries()) {
        body[entry[0]] = entry[1];
      }
    }
    requestPath = Object.getOwnPropertyNames(body).length ? body['?path'] : '';
    const files = await fetchFiles(
      decodeURIComponent(requestPath),
      null,
      body.passwd
    );
    return new Response(files, {
      headers: returnHeaders,
    });
  }
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

async function getContent(url) {
  const response = await cacheFetch(url);
  const result = await gatherResponse(response);
  return result;
}

async function getContentWithHeaders(url, headers) {
  const response = await cacheFetch(url, {
    headers: headers,
  });
  const result = await gatherResponse(response);
  return result;
}

async function fetchFormData(url, data) {
  const formdata = new FormData();
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      formdata.append(key, data[key]);
    }
  }
  const requestOptions = {
    method: 'POST',
    body: formdata,
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
  const result = await fetchFormData(url, data);

  if (typeof FODI_CACHE !== 'undefined' && result?.refresh_token) {
    result.save_time = Date.now();
    await FODI_CACHE.put('token_data', JSON.stringify(result));
  }
  return result.access_token;
}

async function fetchFiles(path, fileName, passwd, viewExposePathPassword) {
  const parent = path || '/';
  if (path === '/') path = '';
  if (path || EXPOSE_PATH)
    path = ':' + encodeURIComponent(EXPOSE_PATH + path) + ':';

  const accessToken = await fetchAccessToken();
  const expand =
    '/children?select=name,size,parentReference,lastModifiedDateTime,@microsoft.graph.downloadUrl&$top=200';
  const uri = OAUTH.apiUrl + path + expand;

  let pageRes = await getContentWithHeaders(uri, {
    Authorization: 'Bearer ' + accessToken,
  });
  let children = pageRes.value;
  while (pageRes['@odata.nextLink']) {
    pageRes = await getContentWithHeaders(pageRes['@odata.nextLink'], {
      Authorization: 'Bearer ' + accessToken,
    });
    children = children.concat(pageRes.value);
  }

  const pwFile = children.find((file) => file.name === PASSWD_FILENAME);
  const PASSWD = pwFile
    ? await getContent(pwFile['@microsoft.graph.downloadUrl'])
    : '';
  if (viewExposePathPassword) {
    return PASSWD;
  }

  let authState = PATH_AUTH_STATES.NO_PW_FILE;
  if (pwFile) {
    if (PASSWD === passwd) {
      authState = PATH_AUTH_STATES.PW_CORRECT;
    } else {
      authState = PATH_AUTH_STATES.PW_ERROR;
    }
  }

  if (
    authState === PATH_AUTH_STATES.NO_PW_FILE &&
    parent.split('/').length <= PROTECTED_LAYERS
  ) {
    const upperPasswd = EXPOSE_PASSWD
      ? EXPOSE_PASSWD
      : parent === '/'
      ? ''
      : await fetchFiles('', null, null, true);
    if (upperPasswd !== passwd) {
      authState = PATH_AUTH_STATES.PW_ERROR;
    }
  }

  // Auth failed
  if (authState === PATH_AUTH_STATES.PW_ERROR) {
    return JSON.stringify({
      parent,
      files: [],
      encrypted: true,
    });
  }

  // Download file
  if (fileName) {
    return children.find(
      (file) => file.name === decodeURIComponent(fileName)
    )?.['@microsoft.graph.downloadUrl'];
  }

  // List folder
  return JSON.stringify({
    parent,
    files: children
      .map((file) => ({
        name: file.name,
        size: file.size,
        time: file.lastModifiedDateTime,
        url: file['@microsoft.graph.downloadUrl'],
      }))
      .filter((file) => file.name !== PASSWD_FILENAME),
  });
}

async function uploadFiles(fileJsonList) {
  const fileList = fileJsonList['files'];
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
