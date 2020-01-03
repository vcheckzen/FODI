/**
 * IS_CN: 如果为世纪互联版本，请将 0 改为 1
 * EXPOSE_PATH：暴露路径，如全盘展示请留空，否则按 '/媒体/音乐' 的格式填写
 * ONEDRIVE_REFRESHTOKEN: refresh_token
 */
const IS_CN = 0;
const EXPOSE_PATH = '';
const ONEDRIVE_REFRESHTOKEN = '';

const SECRET = ONEDRIVE_REFRESHTOKEN.substr(0, 10);
const CRYPTOJS = require("crypto-js");
const REQUEST_PROMISE = require('request-promise');
const OAUTH = initializeOAUTH();

function parseParamsFromBody(body) {
    let params = {};
    if (body) {
        const PARAM_STRINGS = body.split('&');
        PARAM_STRINGS.forEach(paramString => {
            const PARAM = paramString.split('=');
            params[PARAM[0]] = decodeURIComponent(PARAM[1]);
        });
    }
    return params;
}

function initializeOAUTH() {
    let oauth = { version: IS_CN };
    oauth.redirectUri = 'https://scfonedrive.github.io';
    oauth.refreshToken = ONEDRIVE_REFRESHTOKEN;
    switch (oauth.version) {
        case 1:
            // 世纪互联
            // https://portal.azure.cn
            oauth.clientId = '04c3ca0b-8d07-4773-85ad-98b037d25631';
            oauth.clientSecret = 'h8@B7kFVOmj0+8HKBWeNTgl@pU/z4yLB';
            oauth.oauthUrl = 'https://login.partner.microsoftonline.cn/common/oauth2/v2.0/';
            oauth.apiUrl = 'https://microsoftgraph.chinacloudapi.cn/v1.0/me/drive/root';
            oauth.scope = 'https://microsoftgraph.chinacloudapi.cn/Files.ReadWrite.All offline_access';
            break;
        default:
            // 默认支持商业版与个人版
            // https://portal.azure.com
            oauth.clientId = '4da3e7f2-bf6d-467c-aaf0-578078f0bf7c';
            oauth.clientSecret = '7/+ykq2xkfx:.DWjacuIRojIaaWL0QI6';
            oauth.oauthUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/';
            oauth.apiUrl = 'https://graph.microsoft.com/v1.0/me/drive/root';
            oauth.scope = 'https://graph.microsoft.com/Files.ReadWrite.All offline_access';
            break;
    }
    return oauth;
}

function getAccessToken() {
    const OPTIONS = {
        uri: OAUTH.oauthUrl + 'token',
        form: {
            client_id: OAUTH.clientId,
            client_secret: OAUTH.clientSecret,
            grant_type: 'refresh_token',
            requested_token_use: 'on_behalf_of',
            refresh_token: OAUTH.refreshToken
        },
        json: true
    };
    return new Promise(resolve =>
        REQUEST_PROMISE(OPTIONS)
            .then(body => {
                resolve(body.access_token);
            })
    );
}


function getContent(uri) {
    return new Promise(resolve => {
        REQUEST_PROMISE(uri)
            .then(content => resolve(content));
    });
}

function fetchFiles(path, fileName, passwd) {
    if (!path || path === '/') {
        if (EXPOSE_PATH === '') {
            path = '';
        } else {
            path = ':' + EXPOSE_PATH;
        }
    } else {
        if (EXPOSE_PATH === '') {
            path = ':' + path;
        } else {
            path = ':' + EXPOSE_PATH + '/' + path;
        }
    }

    const URI = OAUTH.apiUrl + path + '?expand=children(select=name,size,parentReference,lastModifiedDateTime,@microsoft.graph.downloadUrl)';
    const OPTIONS = {
        uri: encodeURI(URI),
        headers: {
            Authorization: 'Bearer ' + OAUTH.accessToken
        },
        json: true
    };
    return new Promise(resolve =>
        REQUEST_PROMISE(OPTIONS)
            .then(async body => {
                if (fileName) {
                    body.children.forEach(file => {
                        if (file.name === fileName) {
                            resolve(file['@microsoft.graph.downloadUrl']);
                            return;
                        }
                    });
                } else {
                    let files = [];
                    let encrypted = false;
                    for (let i = 0; i < body.children.length; i++) {
                        const file = body.children[i];
                        if (file.name === '.password') {
                            const PASSWD = await getContent(file['@microsoft.graph.downloadUrl']);
                            if (PASSWD !== passwd) {
                                encrypted = true;
                                break;
                            } else {
                                continue;
                            }
                        }
                        files.push({
                            name: file.name,
                            size: file.size,
                            time: file.lastModifiedDateTime,
                            url: file['@microsoft.graph.downloadUrl']
                        });
                    }
                    let parent;
                    if (body.children.length) {
                        parent = body.children[0].parentReference.path;
                    } else {
                        parent = body.parentReference.path;
                    }
                    parent = parent.split(':').pop().replace(EXPOSE_PATH, '') || '/';
                    if (encrypted) {
                        resolve({ parent: parent, files: [], encrypted: true });
                    } else {
                        resolve({ parent: parent, files: files });
                    }
                }
            })
    );
}

async function returnAccessToken() {
    const accessToken = await getAccessToken();
    const encrypted = CRYPTOJS.AES.encrypt(accessToken.substr(0, 10), SECRET);
    return {
        isBase64: false,
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ encrypted: encodeURIComponent(encrypted), plain: encodeURIComponent(accessToken.substring(10)) })
    };
}

async function redirectToDownloadServer(path, fileName) {
    const ACCESS_TOKEN = await getAccessToken();
    OAUTH.accessToken = ACCESS_TOKEN;
    const URL = await fetchFiles(path, fileName);
    return {
        isBase64: false,
        statusCode: 302,
        headers: { 'Content-Type': 'text/html', 'Location': URL }
    };
}

async function returnFileArray(path, encrypted, plain, passwd) {
    OAUTH.accessToken = CRYPTOJS.enc.Utf8.stringify(CRYPTOJS.AES.decrypt(encrypted, SECRET)) + plain;
    const FILES = await fetchFiles(path, null, passwd);
    return {
        isBase64: false,
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(FILES)
    };
}

exports.main_handler = async (event, context, callback) => {
    let REQUEST_PATH;
    if (event.queryString.file) {
        const FILE_NAME = event.queryString.file.split('/').pop();
        REQUEST_PATH = event.queryString.file.replace('/' + FILE_NAME, '');
        return redirectToDownloadServer(REQUEST_PATH, FILE_NAME);
    } else if (event.queryString.hasOwnProperty('accessToken')) {
        return returnAccessToken();
    } else {
        const PARAMS = parseParamsFromBody(event.body);
        REQUEST_PATH = PARAMS ? PARAMS.path : '';
        return returnFileArray(REQUEST_PATH, PARAMS.encrypted, PARAMS.plain, PARAMS.passwd);
    }
};

// main_handler({ queryString: { file: '/Android/Devices/Firmware-Flash-Tool/QPST_2.7.474.7z' } }).then(console.log);
// main_handler({ queryString: { accessToken: '' } }).then(data => {
//     const NEW_ACCESS_TOKEN = JSON.parse(data.body);
//     main_handler({ body: 'path=/Proxy&encrypted=' + NEW_ACCESS_TOKEN.encrypted + '&plain=' + NEW_ACCESS_TOKEN.plain + '&passwd=1234', queryString: {} }).then(console.log);
// });

