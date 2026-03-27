import argparse


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to YOLO model file.")
    parser.add_argument(
        "--source",
        required=True,
        help='Use "usb0" for webcam, pass an RTSP/HTTP URL, or provide a video/image file path.',
    )
    parser.add_argument(
        "--thresh",
        type=float,
        default=0.5,
        help="Minimum confidence threshold for detections.",
    )
    parser.add_argument(
        "--resolution",
        default=None,
        help='Optional display resolution in WxH format, for example "640x480".',
    )
    parser.add_argument(
        "--record",
        action="store_true",
        help='Record webcam/video output to "demo1.avi". Requires --resolution.',
    )
    return parser.parse_args()
