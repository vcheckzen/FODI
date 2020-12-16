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


def get_ids(list_id):
    content = get(HOST + '/playlist?id=' + list_id).text
    ids = find_all(content, r'<li><a href="/song\?id=(\d+)">')
    return list(set(ids))


def get_mp3(song_id):
    fake_url = HOST + '/song/media/outer/url?id=' + song_id + '.mp3'
    return get(fake_url).headers['Location'].replace('http:', 'https:')


def get_song_info(song_id):
    content = get(HOST + '/song?id=' + song_id).text
    cover = find_first(
        content, r'<meta property="og:image" content="(.+)" />').replace('http:', 'https:')
    cover = cover + '?param=130y130'
    title = find_first(
        content, r'<meta property="og:title" content="(.+)" />')
    artist = find_first(
        content, r'<meta property="og:music:artist" content="(.+)" />')
    mp3 = GATE_WAY + '?id=' + song_id
    return {
        'title': title,
        'artist': artist,
        'mp3': mp3,
        'cover': cover
    }


def get_songs_info_from_api(list_id):
    content = post(HOST + '/api/v3/playlist/detail', {
        'id': list_id,
        'n': 100000,
        's': 8
    }).text
    content = json.loads(content)['playlist']['tracks']
    songs = []
    for song in content:
        artist = ''
        for ar in song['ar']:
            artist += ar['name'] + ','
        cover = song['al']['picUrl']
        if cover:
            cover = cover.replace('http:', 'https:') + '?param=130y130'
        songs.append({
            'title': song['name'],
            'artist': artist[:-1],
            'mp3': GATE_WAY + '?id=' + str(song['id']),
            'cover': cover
        })
    return songs


def get_songs_info_with_traversal(song_ids):
    songs = []
    for id in song_ids:
        try:
            songs.append(get_song_info(id))
        except Exception:
            pass
    return songs


def gen_resp(key, url=None, songs=None):
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


def query(gateway, queryString, *extra):
    global GATE_WAY
    GATE_WAY = gateway
    try:
        if 'id' in queryString:
            return gen_resp('url', get_mp3(queryString['id']))
        elif 'ids' in queryString:
            return gen_resp('success', songs=get_songs_info_with_traversal(queryString['ids'].split(',')))
        elif 'playlist' in queryString:
            return gen_resp('success', songs=get_songs_info_from_api(queryString['playlist']))
    except Exception:
        return gen_resp('api')
    return gen_resp('default')
