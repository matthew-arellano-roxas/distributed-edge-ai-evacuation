import os
import sys

import cv2


def parse_source(source):
    if source.startswith("usb"):
        return "usb", int(source[3:])

    if source.startswith(("rtsp://", "rtmp://", "http://", "https://")):
        return "stream", source

    if os.path.isfile(source):
        _, ext = os.path.splitext(source)
        ext = ext.lower()
        if ext in [".jpg", ".jpeg", ".png", ".bmp"]:
            return "image", source
        if ext in [".avi", ".mov", ".mp4", ".mkv", ".wmv"]:
            return "video", source

    print(f'Input source "{source}" is not supported.')
    sys.exit(1)


def open_source(source_type, source_value, user_res):
    if source_type == "image":
        frame = cv2.imread(source_value)
        if frame is None:
            print("Unable to load image source.")
            sys.exit(1)
        return None, frame

    cap = cv2.VideoCapture(source_value)
    if not cap.isOpened():
        print("Unable to open the webcam/video source.")
        sys.exit(1)

    if user_res:
        res_w, res_h = user_res
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, res_w)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, res_h)

    return cap, None


def read_frame(source_type, cap, single_image_frame):
    if source_type == "image":
        return True, single_image_frame.copy()

    ret, frame = cap.read()
    if (not ret) or frame is None:
        return False, None
    return True, frame
