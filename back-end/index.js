const EXPOSE_PATH = '';
const ONEDRIVE_REFRESHTOKEN = '';
/**
 * EXPOSE_PATH：暴露路径，如全盘展示请留空，否则按 '/媒体/音乐' 的格式填写
 * ONEDRIVE_REFRESHTOKEN: refresh_token
 */

const REQUEST_PROMISE = require('request-promise');

function parseParamsFromBody(body) {
    let params = {};
    if (body) {
        const PARAM_STRINGS = decodeURIComponent(body).split('&');
        PARAM_STRINGS.forEach(paramString => {
            const PARAM = paramString.split('=');
            params[PARAM[0]] = PARAM[1];
        });
    }
    return params;
}

function initializeOAUTH() {
    let oauth = {};
    oauth.redirectUri = 'https://scfonedrive.github.io';
    oauth.refreshToken = ONEDRIVE_REFRESHTOKEN;
    switch (oauth.version) {
        case 1:
            // 1 世纪互联
            // https://portal.azure.cn
            oauth.clientId = '04c3ca0b-8d07-4773-85ad-98b037d25631';
            oauth.clientSecret = 'h8@B7kFVOmj0+8HKBWeNTgl@pU/z4yLB';
            oauth.oauthUrl = 'https://login.partner.microsoftonline.cn/common/oauth2/v2.0/';
            oauth.apiUrl = 'https://microsoftgraph.chinacloudapi.cn/v1.0/me/drive/root';
            oauth.scope = 'https://microsoft.sharepoint-df.com/MyFiles.Read https://microsoft.sharepoint-df.com/MyFiles.Write offline_access';
            break;
        case 2:
            // 2 SharePoint
            // https://portal.azure.com
            oauth.clientId = '4214169b-2f35-4ffd-95b0-1b05d55448e5';
            oauth.clientSecret = 'iTsch4W@afSadYo.[VLLR[FdfKEri803';
            oauth.oauthUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/';
            oauth.apiUrl = 'https://microsoftgraph.chinacloudapi.cn/v1.0/me/drive/root';
            oauth.scope = 'https://graph.microsoft.com/Files.ReadWrite.All offline_access';
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
    const OPTIONS = {
        uri: oauth.oauthUrl + 'token',
        form: {
            client_id: oauth.clientId,
            client_secret: oauth.clientSecret,
            grant_type: 'refresh_token',
            requested_token_use: 'on_behalf_of',
            refresh_token: oauth.refreshToken
        },
        json: true
    };
    return new Promise(resolve =>
        REQUEST_PROMISE(OPTIONS)
            .then(body => {
                oauth.accessToken = body.access_token;
                resolve(oauth);
            })
    );

}

function fetchFiles(oauth, path) {
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

    const URI = oauth.apiUrl + path + '?expand=children(select=name,size,file,parentReference,lastModifiedDateTime,@microsoft.graph.downloadUrl)';
    const OPTIONS = {
        uri: encodeURI(URI),
        headers: {
            Authorization: 'Bearer ' + oauth.accessToken
        },
        json: true
    };
    return new Promise(resolve =>
        REQUEST_PROMISE(OPTIONS)
            .then(body => {
                let formatedFiles = [];
                body.children.forEach(file => {
                    let formatedFile = {
                        name: file.name,
                        size: file.size,
                        file: file.file,
                        parent: file.parentReference.path.split(':').pop().replace(EXPOSE_PATH, ''),
                        time: file.lastModifiedDateTime,
                        url: file['@microsoft.graph.downloadUrl']
                    }
                    formatedFile.parent = formatedFile.parent || '/';
                    formatedFiles.push(formatedFile);
                })
                resolve(formatedFiles);
            })
    );
}

exports.main_handler = async (event, context, callback) => {
    const REQUEST_FILE = event.queryString.file;
    let REQUEST_PATH;
    let FILE_NAME;
    if (typeof REQUEST_FILE !== 'undefined') {
        FILE_NAME = REQUEST_FILE.split('/').pop();
        REQUEST_PATH = REQUEST_FILE.replace('/' + FILE_NAME, '');
    } else {
        const PARAMS = parseParamsFromBody(event.body);
        REQUEST_PATH = PARAMS.path || '';
    }

    const OAUTH = await initializeOAUTH();
    const FILES = await fetchFiles(OAUTH, REQUEST_PATH);

    if (typeof REQUEST_FILE !== 'undefined') {
        for (let i = 0; i < FILES.length; i++) {
            if (FILES[i].name === FILE_NAME) {
                return {
                    isBase64: false,
                    statusCode: 302,
                    headers: { 'Content-Type': 'text/html', 'Location': FILES[i].url },
                    body: ''
                }
            }
        }
    }

    return {
        isBase64: false,
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(FILES)
    }
};

// main_handler({ body: 'path=/Index/Android', queryString:{} }).then(console.log);
// main_handler({ queryString: { file: '/Index/Android/Devices/Firmware-Flash-Tool/QPST_2.7.474.7z' } }).then(console.log);
