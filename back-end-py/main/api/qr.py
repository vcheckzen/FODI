#!/usr/bin/env python3
# -*- coding:utf-8 -*-

from ..util import qrencode
GATE_WAY = ''


def gen_resp(key, data=None):
    return {
        'default': {
            'code': -1,
            'error': 'lack of params',
            'example': GATE_WAY + '?method=encode&text=abc&size=12&border=2'
        },
        'success': {
            'code': 0,
            'msg': 'success',
            'data': data
        },
        'server': {
            'code': 2,
            'error': 'server error.'
        },
        'method': {
            'code': 3,
            'error': 'merely support encode method'
        }
    }[key]


def check_params(queryString):
    for param in ['text', 'method']:
        if param not in queryString:
            return gen_resp('default')

    if queryString['method'] != 'encode':
        return gen_resp('method')

    return gen_resp('success')


def query(gateway, queryString, *extra):
    global GATE_WAY
    GATE_WAY = gateway
    params = check_params(queryString)
    if params['code'] != 0:
        return params
    try:
        size = 12
        border = 2
        if 'size' in queryString:
            size = queryString['size']
        if 'border' in queryString:
            border = queryString['border']
        text = queryString['text']
        data = qrencode(text, size, border)
        return gen_resp('success', data)
    except Exception:
        return gen_resp('server')
