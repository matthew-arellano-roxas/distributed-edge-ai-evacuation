import os
import sys
import time

import cv2
import numpy as np
from ultralytics import YOLO

from yolo_args import parse_args
from yolo_config import FloorState
from yolo_source import open_source, parse_source, read_frame
from yolo_tracking import select_best_detection, update_motion
from yolo_ui import draw_detection


def main():
    args = parse_args()

    if not os.path.exists(args.model):
        print("Model file not found.")
        sys.exit(1)

    user_res = None
    if args.resolution:
        width, height = args.resolution.lower().split("x")
        user_res = (int(width), int(height))

    if args.record and not user_res:
        print("Recording requires --resolution.")
        sys.exit(1)

    source_type, source_value = parse_source(args.source)
    model = YOLO(args.model, task="detect")
    labels = model.names
    cap, single_image_frame = open_source(source_type, source_value, user_res)

    recorder = None
    if args.record:
        recorder = cv2.VideoWriter(
            "demo1.avi",
            cv2.VideoWriter_fourcc(*"MJPG"),
            30,
            user_res,
        )

    tracked_object = None
    current_motion_status = "idle"
    motion_hold_counter = 0
    floor_state = FloorState()
    frame_rate_buffer = []
    fps_avg_len = 200

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

        if source_type != "image":
            t_stop = time.perf_counter()
            frame_rate = 1.0 / max(t_stop - t_start, 1e-6)
            if len(frame_rate_buffer) >= fps_avg_len:
                frame_rate_buffer.pop(0)
            frame_rate_buffer.append(frame_rate)
            avg_frame_rate = float(np.mean(frame_rate_buffer))
            status_text = f"{status_text} | FPS: {avg_frame_rate:.2f}"

        draw_detection(frame, tracked_object, status_text, floor_state)
        cv2.imshow("YOLO detection results", frame)

        if recorder is not None:
            recorder.write(frame)

        wait_time = 0 if source_type == "image" else 5
        key = cv2.waitKey(wait_time) & 0xFF
        if key == ord("q"):
            break
        if key == ord("p"):
            cv2.imwrite("capture.png", frame)

        if source_type == "image":
            break

    if cap is not None:
        cap.release()
    if recorder is not None:
        recorder.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
