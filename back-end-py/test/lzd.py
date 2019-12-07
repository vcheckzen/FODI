#!/usr/bin/env python3
# -*- coding:utf-8 -*-

from ..main.api.lanzous import get_download_info


def out_download_info(fid, pwd, client):
    print(get_download_info(fid, pwd, client))
    print('---------------------------------')


out_download_info('i19pnjc', '1pud', 'mobile')
out_download_info('i19pnjc', '1pud', 'pc')
out_download_info('i1aesgj', '', 'mobile')
out_download_info('i1aesgj', '', 'pc')
