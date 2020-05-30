#!/usr/bin/env python3
# -*- coding:utf-8 -*-

__all__ = [
    'qr',
    'aes',
    'fodi',
    'ciba',
    'proxy',
    'dnspod',
    'wxstep',
    'lanzous',
    'cloudmusic',
]

for api in __all__:
    exec('from .' + api + ' import query as ' + api)

API_NAMES = __all__
