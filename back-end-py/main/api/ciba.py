#!/usr/bin/env python3
# -*- coding:utf-8 -*-

import json
import pytz
import datetime
from ..util import get

API = 'http://sentence.iciba.com'
PUB_PARAMS = '?c=dailysentence&m=getdetail'
GATE_WAY = ''
TODAY = ''


def formated_today():
    utc_time = datetime.datetime.now(pytz.utc)
    central = utc_time.astimezone(pytz.timezone('Asia/Shanghai'))
    return central.strftime("%Y-%m-%d")


def gen_resp(key, content=None):
    if not content:
        content = {
            'date': TODAY,
            'zh': '心宽体胖',
            'en': 'Laugh and grow fat.'
        }
    return {
        'success': {
            'code': 0,
            'msg': 'success',
            **content
        },
        'api': {
            'code': 1,
            'error': 'ciba api changed.',
            **content
        },
        'server': {
            'code': 2,
            'error': 'ciba server error.',
            **content
        }
    }[key]


def query(gateway, *extra):
    global GATE_WAY
    global TODAY
    GATE_WAY = gateway
    TODAY = formated_today()

    try:
        url = API + PUB_PARAMS + '&title=' + TODAY
        content = json.loads(get(url).text)
    except Exception:
        return gen_resp('server')

    try:
        return gen_resp('success', {
            'date': TODAY,
            'zh': content['note'],
            'en': content['content']
        })
    except Exception:
        return gen_resp('api')
