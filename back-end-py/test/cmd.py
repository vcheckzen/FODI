#!/usr/bin/env python3
# -*- coding:utf-8 -*-

import json
from ..main.api.cloudmusic import get_ids, get_song_info, get_songs_info1, get_songs_info2


def song_info_test(id):
    print(get_song_info(id))


def playlist_2_ids_test(playlist):
    print(get_ids(playlist))


def playlist_2_songs_test(playlist):
    songs = get_songs_info1(playlist)
    print('there are ' + str(len(songs)) + ' songs.')
    print(json.dumps(songs))


def ids_to_songs_test(ids):
    print(get_songs_info2(ids.split(',')))


song_info_test('1379628076')
playlist_2_ids_test('979351337')
playlist_2_songs_test('552606452')
ids_to_songs_test('1379628076,38592976,409654891,1345848098,514761281,326738')
