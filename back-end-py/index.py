#!/usr/bin/env python3
# -*- coding:utf-8 -*-

import json
for s in ['', '.']:
    p = s + 'main.api'
    try:
        for v in ['*', 'API_NAMES']:
            exec('from ' + p + ' import ' + v)
        break
    except Exception:
        pass


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


def router(event):
    """对多个 api 路径分发
    """
    door = 'https://' + event['headers']['host'] + '/' \
        + event['requestContext']['stage']
    func_path = event['requestContext']['path']

    api = event['path'].replace(func_path, '').strip('/')
    api_url = door + event['path']

    queryString = event['queryString']
    body = None
    if 'body' in event:
        body = event['body']

    if api in API_NAMES:
        data = eval(api)(api_url, queryString, body)
    else:
        data = {
            'code': -1,
            'error': 'path error.',
            'examples': [door + func_path + '/' + p + '/' for p in API_NAMES]
        }

    return data


def main_handler(event, content):
    print(event)
    """网关入口函数
    """
    return gen_response(router(event))
