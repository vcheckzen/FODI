#!/usr/bin/env python3
# -*- coding:utf-8 -*-

import qrcode
from io import BytesIO
from base64 import b64encode


def qrencode(text, box_size, border_box):
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=box_size,
        border=border_box,
    )
    qr.add_data(text)
    buffered = BytesIO()
    qr.make_image().save(buffered, format='JPEG')
    return 'data:image/jpg;base64,' + b64encode(buffered.getvalue()).decode('utf-8')
