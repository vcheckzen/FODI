#!/usr/bin/env python3
# -*- coding:utf-8 -*-

import json
try:
    from main.api import ciba, proxy, dnspod, wxstep, lanzous, cloudmusic, aes, qr, fodi
except Exception:
    from .main.api import ciba, proxy, dnspod, wxstep, lanzous, cloudmusic, aes, qr, fodi


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


def check_path(real_path, expected_path):
    """检查 api 路径
    """
    return real_path in ['/' + expected_path, '/' + expected_path + '/']


def router(event):
    """对多个 api 路径分发
    """
    host = event['headers']['host']
    base = event['requestContext']['path']
    stage = event['requestContext']['stage']
    door = 'https://' + host + '/' + stage
    inner = door + event['path']

    queryString = event['queryString']
    path = event['path'].replace(base, '')
    body = None
    if 'body' in event:
        body = event['body']

    if check_path(path, 'ciba'):
        data = ciba(inner)
    elif check_path(path, 'proxy'):
        data = proxy(inner, queryString)
    elif check_path(path, 'dnspod'):
        data = dnspod(inner, queryString)
    elif check_path(path, 'wechat-step'):
        data = wxstep(inner, queryString)
    elif check_path(path, 'lanzous'):
        data = lanzous(inner, queryString)
    elif check_path(path, 'cloudmusic'):
        data = cloudmusic(inner, queryString)
    elif check_path(path, 'aes'):
        data = aes(inner, queryString)
    elif check_path(path, 'qr'):
        data = qr(inner, queryString)
    elif check_path(path, 'fodi'):
        data = fodi(inner, queryString, body)
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
    """网关入口函数
    """
    return gen_response(router(event))
