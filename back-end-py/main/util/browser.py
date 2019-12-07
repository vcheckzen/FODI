#!/usr/bin/env python3
# -*- coding:utf-8 -*-

import re
import requests
from PIL import Image
from io import BytesIO
from urllib.parse import unquote_plus, quote_plus, parse_qsl, urlparse

UA = {
    'pc':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Safari/537.36',
    'mobile':
    'Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Mobile Safari/537.36'
}

CONTENT_TYPE = {
    'json': 'application/json',
    'urlencoded': 'application/x-www-form-urlencoded'
}


def urlencode(url):
    return quote_plus(url)


def urldecode(url):
    return unquote_plus(url)


def split_url(url):
    url_splited = urlparse(url)
    return {
        'path': url_splited.path,
        'params': dict(parse_qsl(url_splited.query))
    }


def gen_headers(client=None, referer=None, content_type=None, extra=None):
    headers = {}
    if client:
        headers['User-Agent'] = UA[client]
    else:
        headers['User-Agent'] = UA['pc']

    if referer:
        headers['Referer'] = referer

    if content_type:
        headers['Content-Type'] = CONTENT_TYPE[content_type]

    if extra:
        headers = {
            **headers,
            **extra
        }
    return headers


def find_all(text, pattern):
    return re.findall(pattern, text)


def find_first(text, pattern):
    return str(re.findall(pattern, text)[0])


def get(url, client=None, referer=None, extra=None, params=None):
    headers = gen_headers(client, referer, None, extra)
    return requests.get(url=url, params=params, headers=headers, allow_redirects=False)


def post(url, data=None, client=None, referer=None, content_type=None, extra=None):
    headers = gen_headers(client, referer, content_type, extra)
    return requests.post(url=url, headers=headers, data=data)


def post_json(url, data, client=None, referer=None, extra=None):
    return post(url, data, client, referer, 'json', extra)


def post_urlencoded_data(url, data, client=None, referer=None, extra=None):
    return post(url, data, client, referer, 'urlencoded', extra)
