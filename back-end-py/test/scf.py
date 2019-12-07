#!/usr/bin/env python3
# -*- coding:utf-8 -*-

import json
from ..main.api import ciba, proxy, dnspod, wxstep, lanzous, cloudmusic, aes, qr, fodi
from ..main.util import split_url


def gen_response(body):
    data = {
        'isBase64Encoded': False,
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
        }
    }
    if body['code'] == 301:
        data['headers']['Content-Type'] = 'application/html; charset=utf-8'
        data['body'] = body['html']
    elif body['code'] == 302:
        data['statusCode'] = body['code']
        data['headers'] = {'Location': body['url']}
    else:
        data['body'] = json.dumps(body)
    return data


def path_1in2(path1, path2):
    return path1 in ['/' + path2, '/' + path2 + '/']


def router(event):
    host = event['headers']['host']
    base = event['requestContext']['path']
    stage = event['requestContext']['stage']
    door = 'https://' + host + '/' + stage
    inner = door + event['path']
    queryString = event['queryString']
    path = event['path'].replace(base, '')

    if path_1in2(path, 'ciba'):
        data = ciba(inner)
    elif path_1in2(path, 'proxy'):
        data = proxy(inner, queryString)
    elif path_1in2(path, 'dnspod'):
        data = dnspod(inner, queryString)
    elif path_1in2(path, 'wechat-step'):
        data = wxstep(inner, queryString)
    elif path_1in2(path, 'lanzous'):
        data = lanzous(inner, queryString)
    elif path_1in2(path, 'cloudmusic'):
        data = cloudmusic(inner, queryString)
    elif path_1in2(path, 'aes'):
        data = aes(inner, queryString)
    elif path_1in2(path, 'qr'):
        data = qr(inner, queryString)
    elif path_1in2(path, 'fodi'):
        data = fodi(inner, queryString, event['body'])
    else:
        paths = ['ciba', 'proxy', 'dnspod', 'wechat-step',
                 'lanzous', 'cloudmusic', 'aes', 'qr', 'fodi']
        data = {
            'code': -1,
            'error': 'path error.',
            'examples': [door + base + '/' + p + '/' for p in paths]
        }
    return data


def main_handler(event, context):
    data = router(event)
    return gen_response(data)


def request(url, body=None):
    url_splited = split_url(url)
    event = {
        'headers': {
            'host': 'www.api.com'
        },
        'requestContext': {
            'path': '/pyscf',
            'stage': 'release'
        },
        'path': url_splited['path'],
        'queryString': url_splited['params'],
        'body': body
    }
    print('https://' + event['headers']['host'] +
          '/' + event['requestContext']['stage'] + url)
    print('body:')
    print(body)
    print(main_handler(event, None))
    print('--------------------------------')
