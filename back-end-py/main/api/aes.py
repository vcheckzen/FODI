#!/usr/bin/env python3
# -*- coding:utf-8 -*-

from ..util import aes_ecb_pkcs7_b64_encrypt as encrypt, aes_ecb_pkcs7_b64_decrypt as decrypt
GATE_WAY = ''


def gen_error(key, data=None):
    return {
        'default': {
            'code': -1,
            'error': 'lack of params',
            'examples': [
                GATE_WAY + '?method=encrypt&key=1234567890123456&data=1379628076',
                GATE_WAY + '?method=decrypt&key=1234567890123456&data=roLzT3GBhVQw22WrUPAdsw=='
            ]
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
            'error': 'merely support encrypt and decrypt.'
        },
        'key': {
            'code': 4,
            'error': 'key must be 16 bytes.'
        }
    }[key]


def check_params(queryString):
    for params in ['key', 'data', 'method']:
        if params not in queryString:
            return gen_error('default')

    if queryString['method'] not in ['encrypt', 'decrypt']:
        return gen_error('method')

    if len(queryString['key']) < 16:
        return gen_error('key')

    return gen_error('success')


def query(gateway, queryString):
    global GATE_WAY
    GATE_WAY = gateway
    params = check_params(queryString)
    if params['code'] != 0:
        return params
    try:
        key = queryString['key']
        data = queryString['data']
        if queryString['method'] == 'encrypt':
            data = encrypt(data, key)
        else:
            data = decrypt(data, key)
        return gen_error('success', data)
    except Exception:
        return gen_error('server')
