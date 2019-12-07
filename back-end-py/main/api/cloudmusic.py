#!/usr/bin/env python3
# -*- coding:utf-8 -*-

import json
from ..util import get as cloudmusic_get, post_urlencoded_data as cloudmusic_post, find_first, find_all

HOST = 'https://music.163.com'
GATE_WAY = ''


def get(url):
    return cloudmusic_get(url, 'pc', HOST)


def post(url, data):
    return cloudmusic_post(url, data, 'pc', HOST)


def get_ids(id):
    content = get(HOST + '/playlist?id=' + id).text
    ids = find_all(content, r"<li><a href=\"/song\?id=(\d+)\">")
    return list(set(ids))


def get_mp3(id):
    fake_url = HOST + '/song/media/outer/url?id=' + id + '.mp3'
    return get(fake_url).headers['Location'].replace('http:', 'https:')


def get_song_info(id):
    content = get(HOST + '/song?id=' + id).text
    cover = find_first(
        content, r"<meta property=\"og:image\" content=\"(.+)\" />").replace('http:', 'https:')
    cover = cover + '?param=130y130'
    title = find_first(
        content, r"<meta property=\"og:title\" content=\"(.+)\" />")
    artist = find_first(
        content, r"<meta property=\"og:music:artist\" content=\"(.+)\" />")
    mp3 = GATE_WAY + '?id=' + id
    return {
        'title': title,
        'artist': artist,
        'mp3': mp3,
        'cover': cover
    }


def get_songs_info1(id):
    content = post(HOST + '/api/v3/playlist/detail', {
        'id': id,
        'n': 100000,
        's': 8
    }).text
    content = json.loads(content)['playlist']['tracks']
    songs = []
    for song in content:
        artist = ''
        for ar in song['ar']:
            artist += ar['name'] + ','
        songs.append({
            'title': song['name'],
            'artist': artist[:-1],
            'mp3': GATE_WAY + '?id=' + str(song['id']),
            'cover': song['al']['picUrl'] + '?param=130y130'
        })
    return songs


def get_songs_info2(ids):
    songs = []
    for id in ids:
        try:
            songs.append(get_song_info(id))
        except Exception:
            pass
    return songs


def gen_error(key, url=None, songs=None):
    return {
        'default': {
            'code': -1,
            'error': 'lack of params',
            'examples': [
                GATE_WAY + '?id=1379628076',
                GATE_WAY + '?ids=1379628076,38592976',
                GATE_WAY + '?playlist=979351337'
            ]
        },
        'url': {
            'code': 302,
            'url': url
        },
        'success': {
            'code': 0,
            'msg': 'success',
            'songs': songs
        },
        'api': {
            'code': 1,
            'error': 'cloudmusic api changed.'
        }
    }[key]


def query(gateway, queryString):
    global GATE_WAY
    GATE_WAY = gateway
    try:
        if 'id' in queryString:
            return gen_error('url', get_mp3(queryString['id']))
        elif 'ids' in queryString:
            return gen_error('success', songs=get_songs_info2(queryString['ids'].split(',')))
        elif 'playlist' in queryString:
            return gen_error('success', songs=get_songs_info1(queryString['playlist']))
    except Exception:
        return gen_error('api')
    return gen_error('default')
