#!/usr/bin/env python3
# -*- coding:utf-8 -*-

import json
from ..util import (urlencode, urldecode, split_url, get, post_urlencoded_data as postdata,
                    aes_ecb_pkcs7_b64_encrypt as encrypt,
                    aes_ecb_pkcs7_b64_decrypt as decrypt)


EXPOSE_PATH = ""
ONEDRIVE_REFRESHTOKEN = ""


SECRET = ONEDRIVE_REFRESHTOKEN[:16]
OAUTH = {
    'redirectUri': 'https://scfonedrive.github.io',
    'refreshToken': ONEDRIVE_REFRESHTOKEN,
    'clientId': '4da3e7f2-bf6d-467c-aaf0-578078f0bf7c',
    'clientSecret': '7/+ykq2xkfx:.DWjacuIRojIaaWL0QI6',
    'oauthUrl': 'https://login.microsoftonline.com/common/oauth2/v2.0/',
    'apiUrl': 'https://graph.microsoft.com/v1.0/me/drive/root',
    'scope': 'https://graph.microsoft.com/Files.ReadWrite.All offline_access'
}
GATE_WAY = ''


def gen_error(key, url=None, content={}):
    return {
        'success': {
            'code': 0,
            'msg': 'success',
            **content
        },
        'url': {
            'code': 302,
            'url': url
        },
        'server': {
            'code': 2,
            'error': 'onedrive server error.',
        }
    }[key]


def get_access_token():
    url = OAUTH['oauthUrl'] + 'token'
    data = {
        'client_id': OAUTH['clientId'],
        'client_secret': OAUTH['clientSecret'],
        'grant_type': 'refresh_token',
        'requested_token_use': 'on_behalf_of',
        'refresh_token': OAUTH['refreshToken']
    }
    return json.loads(postdata(url, data).text)['access_token']


def get_content(url, params=None, extra=None):
    return get(url, params=params, extra=extra).text


def fetch(path=None):
    if not path or path == '/':
        if EXPOSE_PATH == '':
            path = ''
        else:
            path = ':' + EXPOSE_PATH
    else:
        if EXPOSE_PATH == '':
            path = ':' + path
        else:
            path = ':' + EXPOSE_PATH + path
    url = OAUTH['apiUrl'] + path
    params = {
        'expand': 'children(select=name,size,parentReference,lastModifiedDateTime,@microsoft.graph.downloadUrl)'
    }
    extra = {
        'Authorization': 'Bearer ' + OAUTH['accessToken']
    }
    return json.loads(get_content(url, params, extra))


def fetch_files(path=None, file_name=None, passwd=None):
    body = fetch(path)
    if file_name is not None:
        for file in body['children']:
            if file['name'] == file_name:
                return file['@microsoft.graph.downloadUrl']
    else:
        files = []
        encrypted = False
        for i in list(range(len(body['children']))):
            file = body['children'][i]
            if file['name'] == '.password':
                PASSWD = get_content(file['@microsoft.graph.downloadUrl'])
                if PASSWD != passwd:
                    encrypted = True
                    break
                else:
                    continue
            this_file = {
                'name': file['name'],
                'size': file['size'],
                'time': file['lastModifiedDateTime']
            }
            if '@microsoft.graph.downloadUrl' in file:
                this_file['url'] = file['@microsoft.graph.downloadUrl']
            files.append(this_file)
        if len(body['children']):
            parent = body['children'][0]['parentReference']['path']
        else:
            parent = body['parentReference']['path']
        parent = parent.split(':').pop().replace(EXPOSE_PATH, '')
        if parent == '':
            parent = '/'
        if encrypted:
            return {'parent': parent, 'files': [], 'encrypted': True}
        else:
            return {'parent': parent, 'files': files}


def return_access_token():
    access_token = get_access_token()
    encrypted = encrypt(access_token[:16], SECRET)
    return gen_error('success', content={
        'encrypted': urlencode(encrypted),
        'plain': urlencode(access_token[16:])
    })


def redirect_to_download_server(path, file_name):
    OAUTH['accessToken'] = get_access_token()
    URL = fetch_files(path, file_name)
    return gen_error('url', URL)


def return_file_array(path, encrypted, plain, passwd):
    OAUTH['accessToken'] = decrypt(encrypted, SECRET) + plain
    return gen_error('success', content=fetch_files(path, None, passwd))


def query(gateway, queryString=None, body=None):
    global GATE_WAY
    GATE_WAY = gateway
    try:
        if 'file' in queryString:
            FILE_NAME = queryString['file'].split('/').pop()
            REQUEST_PATH = queryString['file'].replace('/' + FILE_NAME, '')
            return redirect_to_download_server(REQUEST_PATH, FILE_NAME)
        elif body is not None:
            PARAMS = split_url(body)['params']
            return return_file_array(
                urldecode(PARAMS['path']), PARAMS['encrypted'], PARAMS['plain'], PARAMS['passwd'])
        else:
            return return_access_token()
    except Exception:
        return gen_error('server')
