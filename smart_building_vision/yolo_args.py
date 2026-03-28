import argparse


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to YOLO model file.")
    parser.add_argument(
        "--source",
        required=True,
        help='Use "usb0" for webcam, or pass a video/image file path.',
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
    parser.add_argument(
        "--port",
        type=int,
        default=5432,
        help="Flask server port.",
    )
    return parser.parse_args()