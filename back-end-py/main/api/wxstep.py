#!/usr/bin/env python3
# -*- coding:utf-8 -*-

import json
import time
import hashlib
from ..util import post

API = 'http://weixin.droi.com/health/phone/index.php/SendWechat/'
SALT = '8061FD'
TIMESTAMP = str(int(time.time()))
GATE_WAY = ''


def gen_resp(key, msg='wx server error.'):
    return {
        'default': {
            'code': -1,
            'error': 'lack of params.',
            'example': GATE_WAY + '?id=name&step=8888'
        },
        'success': {
            'code': 0,
            'msg': msg
        },
        'api': {
            'code': 1,
            'error': 'wx api changed.'
        },
        'server': {
            'code': 2,
            'error': msg
        },
        'openid': {
            'code': 3,
            'error': 'cannot get openid.'
        }
    }[key]


def md5hex(data):
    return hashlib.md5(data.encode(encoding='UTF-8')).hexdigest()


def query(gateway, queryString, *extra):
    global GATE_WAY
    GATE_WAY = gateway
    if 'id' in queryString:
        account_id = str(queryString['id'])
    else:
        return gen_resp('default')

    if 'step' in queryString:
        step = str(queryString['step'])
    else:
        return gen_resp('default')

    data = account_id + SALT + TIMESTAMP
    sign = md5hex(data)
    data = {'accountId': account_id, 'timeStamp': TIMESTAMP, 'sign': sign}
    url = API + 'getWxOpenid'
    try:
        data = json.loads(post(url, data).text)
        openid = data['openid']
    except Exception:
        return gen_resp('openid')

    data = account_id + SALT + step + SALT + TIMESTAMP + SALT + openid
    sign = md5hex(data)
    data = {
        'accountId': account_id,
        'jibuNuber': step,
        'timeStamp': TIMESTAMP,
        'sign': sign
    }
    url = API + 'stepSubmit?accountId'
    try:
        data = json.loads(post(url, data).text)
        error_type = 'success'
        if 'errcode' in data:
            error_type = 'server'
        return gen_resp(error_type, data['messsage'])
    except Exception:
        return gen_resp('api')
