#!/usr/bin/env python3
# -*- coding:utf-8 -*-

from Crypto.Cipher import AES
from Crypto.Util import Padding
from base64 import b64encode, b64decode


def aes_ecb_pkcs7_b64_encrypt(data, key):
    data = Padding.pad(data.encode('utf-8'), AES.block_size, 'pkcs7')
    aes = AES.new(key.encode('utf-8'), AES.MODE_ECB)
    return b64encode(aes.encrypt(data)).decode('utf-8')


def aes_ecb_pkcs7_b64_decrypt(data, key):
    data = b64decode(data.encode('utf-8'))
    aes = AES.new(key.encode('utf-8'), AES.MODE_ECB)
    return Padding.unpad(aes.decrypt(data), AES.block_size, 'pkcs7').decode('utf-8')
