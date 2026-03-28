import os
import sys
import time
import threading
import cv2
import numpy as np
from flask import Flask, Response
from ultralytics import YOLO

from yolo_args import parse_args
from yolo_config import FloorState
from yolo_source import open_source, parse_source, read_frame
from yolo_tracking import select_best_detection, update_motion
from yolo_ui import draw_detection

app = Flask(__name__)
latest_frame = None

@app.route("/")
def index():
    return """
    <html>
      <head>
        <title>YOLO Stream</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style="margin:0;background:#111;text-align:center;">
        <img src="/video_feed" style="width:100%;max-width:960px;height:auto;" />
      </body>
    </html>
    """

def generate():
    global latest_frame
    while True:
        if latest_frame is None:
            time.sleep(0.05)
            continue
        ok, buffer = cv2.imencode(".jpg", latest_frame)
        if not ok:
            continue
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

@app.route("/video_feed")
def video_feed():
    return Response(generate(), mimetype="multipart/x-mixed-replace; boundary=frame")

def run_detection(args):
    global latest_frame

    if not os.path.exists(args.model):
        print("Model file not found.")
        sys.exit(1)

    user_res = None
    if args.resolution:
        width, height = args.resolution.lower().split("x")
        user_res = (int(width), int(height))

    source_type, source_value = parse_source(args.source)
    model = YOLO(args.model, task="detect")
    labels = model.names
    cap, single_image_frame = open_source(source_type, source_value, user_res)

    tracked_object = None
    current_motion_status = "idle"
    motion_hold_counter = 0
    floor_state = FloorState()
    frame_rate_buffer = []

    while True:
        t_start = time.perf_counter()
        ok, frame = read_frame(source_type, cap, single_image_frame)
        if not ok:
            break

        if user_res:
            frame = cv2.resize(frame, user_res)

        results = model(frame, verbose=False)
        detections = results[0].boxes
        best_detection = select_best_detection(detections, labels, args.thresh, frame.shape, tracked_object)

        tracked_object, current_motion_status, motion_hold_counter = update_motion(
            best_detection,
            tracked_object,
            current_motion_status,
            motion_hold_counter,
            floor_state,
        )

        status_text = "No tracked object"
        if tracked_object is not None:
            status_text = f"Tracked: {tracked_object['label']} ({current_motion_status})"

        t_stop = time.perf_counter()
        fps = 1.0 / max(t_stop - t_start, 1e-6)
        frame_rate_buffer.append(fps)
        if len(frame_rate_buffer) > 60:
            frame_rate_buffer.pop(0)
        avg_fps = sum(frame_rate_buffer) / len(frame_rate_buffer)
        status_text = f"{status_text} | FPS: {avg_fps:.2f}"

        draw_detection(frame, tracked_object, status_text, floor_state)
        latest_frame = frame

    if cap is not None:
        cap.release()

if __name__ == "__main__":
    args = parse_args()
    worker = threading.Thread(target=run_detection, args=(args,), daemon=True)
    worker.start()
    app.run(host="0.0.0.0", port=args.port, threaded=True)