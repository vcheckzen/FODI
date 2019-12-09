#!/usr/bin/env python3
# -*- coding:utf-8 -*-

import json
import pytz
import datetime
from ..util import get

API = 'http://sentence.iciba.com'
PUB_PARAMS = '?c=dailysentence&m=getdetail'
GATE_WAY = ''


def formated_today():
    from_zone = pytz.utc
    to_zone = pytz.timezone('Asia/Shanghai')
    utc = datetime.datetime.now(from_zone)
    central = utc.astimezone(to_zone)
    return central.strftime("%Y-%m-%d")


TODAY = formated_today()
print(TODAY)


def gen_error(key, content=None):
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


def query(gateway):
    global GATE_WAY
    GATE_WAY = gateway
    try:
        url = API + PUB_PARAMS + '&title=' + TODAY
        content = json.loads(get(url).text)
    except Exception:
        return gen_error('server')

    try:
        return gen_error('success', {
            'date': TODAY,
            'zh': content['note'],
            'en': content['content']
        })
    except Exception:
        return gen_error('api')
