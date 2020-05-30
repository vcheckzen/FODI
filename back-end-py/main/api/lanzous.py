#!/usr/bin/env python3
# -*- coding:utf-8 -*-

import re
import json
from urllib.parse import urlencode, quote_plus
from ..util import get as basic_get, post_urlencoded_data, find_first as find

HOST = 'https://www.lanzous.com'
EXTRA_HEADER = {'Accept-Language': 'zh-CN,zh;q=0.9'}
GATE_WAY = ''


def get(url, client):
    return basic_get(url, client, HOST, EXTRA_HEADER)


def post(url, data, client):
    return post_urlencoded_data(url, data, client, HOST, EXTRA_HEADER)


def get_params(fid, pwd, client):
    if client == 'pc':
        text = get(HOST + '/' + fid, client).text
        if pwd:
            params = find(text, r"data : '(.+)'\+pwd") + pwd
        else:
            frame = find(text, r'src="(.{10,})" frameborder')
            text = get(HOST + frame, client).text
            try:
                data = eval(find(text, r"data : ({.+}),//"))
            except Exception:
                exec(find(text, r"var (.+ = '[\w/_+=]{10,}')"))
                data = eval(find(text, r"data : ({.+}),//"))
            params = urlencode(data, quote_via=quote_plus)
        return {'params': params}
    else:
        text = get(HOST + '/tp/' + fid, client).text
        if pwd:
            params = find(text, r"data : '(.*)'\+pwd") + pwd
            return {'params': params}
        else:
            urlp = find(text, r"var.+= '(.+baidu.+)'")
            params = find(text, r"\+ '(\?[\w/+=]+)'")
            return {'params': urlp+params}


def get_download_info(fid, pwd, client):
    params = get_params(fid, pwd, client)
    if client == 'mobile' and not pwd:
        response = get(params['params'], client)
    else:
        response = post(HOST + '/ajaxm.php', params['params'], client)
        result = json.loads(response.text)
        fake_url = result['dom'] + '/file/' + result['url']
        response = get(fake_url, client)
    return {'url': response.headers['location']}


def gen_resp(key, download_info={'url': None}):
    return {
        'default': {
            'code': -1,
            'error': 'lack of params.',
            'examples': [
                GATE_WAY + '?url=' + HOST + '/i1aesgj&type=json',
                GATE_WAY + '?url=' + HOST + '/i19pnjc&pwd=1pud&type=down'
            ]
        },
        'down': {
            'code': 302,
            'url': download_info['url']
        },
        'json': {
            'code': 0,
            'msg': 'success',
            **download_info
        },
        'api': {
            'code': 1,
            'error': 'lanzous api changed.',
        },
        'link': {
            'code': 3,
            'error': 'invalid link.'
        }
    }[key]


def params_check(queryString):
    if 'url' not in queryString:
        return gen_resp('default')

    url = queryString['url']
    if not re.match(HOST + '/[0-9a-z]{7,}', url):
        return gen_resp('link')

    result = {
        'code': 0,
        'fid': url.split('/')[3],
        'pwd': '',
        'type': 'json'
    }
    if 'pwd' in queryString:
        result['pwd'] = queryString['pwd']
    if 'type' in queryString:
        result['type'] = queryString['type']
    return result


def result_check(result):
    if result['url'].find('dev') >= 0:
        return True
    return False


def query(gateway, queryString, *extra):
    global GATE_WAY
    GATE_WAY = gateway
    params = params_check(queryString)
    if params['code'] != 0:
        return params

    fid = params['fid']
    pwd = params['pwd']
    for client in ['mobile', 'pc']:
        try:
            download_info = get_download_info(fid, pwd, client)
            if result_check(download_info):
                return gen_resp(params['type'], download_info)
        except Exception:
            pass

    return gen_resp('api')
