#!/usr/bin/env python3
# -*- coding:utf-8 -*-

from .qr import query as qr
from .aes import query as aes
from .fodi import query as fodi
from .ciba import query as ciba
from .proxy import query as proxy
from .dnspod import query as dnspod
from .lanzous import query as lanzous
from .wechat_step import query as wxstep
from .cloudmusic import query as cloudmusic


__all__ = ['ciba', 'proxy', 'dnspod', 'wxstep', 'lanzous', 'cloudmusic', 'aes', 'qr', 'fodi']
