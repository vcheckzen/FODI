#!/usr/bin/env python3
# -*- coding:utf-8 -*-

from ..util import aes_ecb_pkcs7_b64_encrypt as encrypt, aes_ecb_pkcs7_b64_decrypt as decrypt
GATE_WAY = ''


def gen_resp(key, data=None):
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
            'error': 'merely support encrypt and decrypt method.'
        },
        'key': {
            'code': 4,
            'error': 'key must be 16 bytes.'
        }
    }[key]


def check_params(queryString):
    for params in ['key', 'data', 'method']:
        if params not in queryString:
            return gen_resp('default')

    if queryString['method'] not in ['encrypt', 'decrypt']:
        return gen_resp('method')

    if len(queryString['key']) < 16:
        return gen_resp('key')

    return gen_resp('success')


def query(gateway, queryString, *extra):
    global GATE_WAY
    GATE_WAY = gateway
    ret = check_params(queryString)
    if ret['code'] != 0:
        return ret

    try:
        key = queryString['key']
        data = queryString['data']
        if queryString['method'] == 'encrypt':
            data = encrypt(data, key)
        else:
            data = decrypt(data, key)
        return gen_resp('success', data)
    except Exception:
        return gen_resp('server')
