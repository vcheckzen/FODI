#!/usr/bin/env python3
# -*- coding:utf-8 -*-

from .scf import request


def aes():
    request('/aes/')
    request('/aes/?method=encrypta&key=1234567890123456&data=1379628076')
    request('/aes/?method=encrypt&key=12345678&data=1379628076')
    request('/aes/?method=encrypt&key=1234567890123456&data=1379628076')
    request('/aes/?method=decrypt&key=1234567890123456&data=roLzT3GBhVQw22WrUPAdsw==')


def cb():
    request('/ciba/')


def cm():
    request('/cloudmusic/')
    request('/cloudmusic/?id=514761281')
    request('/cloudmusic/?ids=1379628076,38592976,409654891,1345848098,514761281,326738')
    request('/cloudmusic/?playlist=552606452')


def dp():
    request('/dnspod/')
    request('/dnspod/?subDomain=@')
    request('/dnspod/?domain=logi.ml')
    request('/dnspod/?domain=logi.ml&subDomain=@')


def lz():
    request('/lanzous/')
    request('/lanzous/?url=https://www.a.com/i5tb0vg')
    request('/lanzous/?url=https://www.lanzous.com/i5tb0vg')
    request('/lanzous/?url=https://www.lanzous.com/i19pnjc&pwd=1pud&type=down')


def px():
    request('/proxy/')
    request('/proxy/?url=http://baidu.com')
    request('/proxy/?url=http://google.com')


def qr():
    request('/qr/')
    request('/qr/?method=encode&text=https://logi.ml')
    request('/qr/?method=encode&text=https://logi.ml&size=12&border=2')


def wx():
    request('/wechat-step/')
    request('/wechat-step/?id=e')
    request('/wechat-step/?step=a')
    request('/wechat-step/?id=pknhtfxsw&step=2341')


def fodi():
    # request('/fodi/')
    # request('/fodi/?file=/Android/Devices/Firmware-Flash-Tool/QPST_2.7.474.7z')
    NEW_ACCESS_TOKEN = {"code": 0, "msg": "success", "encrypted": "DoK6BLv0OtImQjGT%2Bnqesv6bf7S4b7bb90yCoZluSUs%3D", "plain": "LCJub25jZSI6IjQ5Nm5vc095QTZZWVNwR1ZOdUhFVVFaMEVMSnZLUGl6UkpxZkRuNURZWXciLCJhbGciOiJSUzI1NiIsIng1dCI6IkJCOENlRlZxeWFHckdOdWVoSklpTDRkZmp6dyIsImtpZCI6IkJCOENlRlZxeWFHckdOdWVoSklpTDRkZmp6dyJ9.eyJhdWQiOiJodHRwczovL2dyYXBoLm1pY3Jvc29mdC5jb20iLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC8xNDY3ZDZhOS1hZjc0LTRmNDUtOGE2NC1jYzg3NzU2Nzg1MWUvIiwiaWF0IjoxNTc1NzE3OTEwLCJuYmYiOjE1NzU3MTc5MTAsImV4cCI6MTU3NTcyMTgxMCwiYWNjdCI6MCwiYWNyIjoiMSIsImFpbyI6IkFTUUEyLzhOQUFBQWNVVzFzNHlYb0h6NldOSGR4YmRHYVlRUlNEbkVsTm45RFZOdGFhUkMwSGc9IiwiYW1yIjpbInB3ZCJdLCJhcHBfZGlzcGxheW5hbWUiOiJvbmVfc2NmIiwiYXBwaWQiOiI0ZGEzZTdmMi1iZjZkLTQ2N2MtYWFmMC01NzgwNzhmMGJmN2MiLCJhcHBpZGFjciI6IjEiLCJpcGFkZHIiOiIxMjEuMjI2LjI1My43NCIsIm5hbWUiOiIxMDI0MTkiLCJvaWQiOiJlYjRhZmFkMy00ZjYwLTRmYzktYjQ1OS03YTAxMmQ2MzkyNWUiLCJwbGF0ZiI6IjMiLCJwdWlkIjoiMTAwMzNGRkY5NEY2NzY3MyIsInNjcCI6IkZpbGVzLlJlYWRXcml0ZS5BbGwgcHJvZmlsZSBvcGVuaWQgZW1haWwiLCJzdWIiOiJWTzY4YllfRmNRc01ZWE53VnF5SF92Y2E1LXo4aU41aVN6UW1BV0hQZ3VvIiwidGlkIjoiMTQ2N2Q2YTktYWY3NC00ZjQ1LThhNjQtY2M4Nzc1Njc4NTFlIiwidW5pcXVlX25hbWUiOiIxMDI0MTlAb25taWNyb3NvZnQubmV0IiwidXBuIjoiMTAyNDE5QG9ubWljcm9zb2Z0Lm5ldCIsInV0aSI6Im5WSE52V0lZWjBlZy1ERVRpUUdGQWciLCJ2ZXIiOiIxLjAiLCJ4bXNfc3QiOnsic3ViIjoid0x5RXM2YVRGUlRaR3pPWi1UemtUelpSSWNmYWszbWc5TkZCUGE2S2pWbyJ9LCJ4bXNfdGNkdCI6MTQzNjcwNTA1NH0.clP3KWhxN6LNQu1K169_rhK3aFQOdUqqk8eeRHPF9Ny8qCz4XbLsgkLj5oXICPQnGqQZ3LwOrI4iZuye7_IImVxk1mguDc4E3FEaxKJcjCFDS1IhdKi8pkFxw16ZMgbMzC4-djTicNVRLAZx7wyG-mPRjiLq_BCCvjNpNCrVMRYUGzTmurmFZuBJA0HDbf97SuxbSyYTjypH2yS6Y4V6sVEZFua-ek6dQwUvHpjxSGoUclqw_ctqQ8Q1sPlEBr6mBkIGQ2UrdS-80BlGQitbQp1vH-x4vioZHi3sl3WXPzIagNtWogNWY9ZB_jhTB0_lnKRDRrm0k77ELuNt9x1ODw"}
    request('/fodi',
            '?path=/&encrypted='
            + NEW_ACCESS_TOKEN['encrypted']
            + '&plain=' + NEW_ACCESS_TOKEN['plain'] + '&passwd=1234')
