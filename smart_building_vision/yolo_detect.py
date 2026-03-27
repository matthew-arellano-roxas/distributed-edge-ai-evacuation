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


# --- MediaMTX RTSP sources ---
CAMERA_SOURCES = [
    "rtsp://localhost:8554/cam0",   # USB webcam 0
    "rtsp://localhost:8554/cam1",   # USB webcam 1
    "rtsp://localhost:8554/csi",    # CSI camera
]


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

    model = YOLO(args.model, task="detect")
    labels = model.names

    # --- Open all 3 cameras ---
    cameras = []
    for src in CAMERA_SOURCES:
        source_type, source_value = parse_source(src)
        cap, single_image_frame = open_source(source_type, source_value, user_res)
        cameras.append((source_type, cap, single_image_frame))

    # --- Per-camera state (your existing state vars, one set per cam) ---
    states = [
        {
            "tracked_object": None,
            "current_motion_status": "idle",
            "motion_hold_counter": 0,
            "floor_state": FloorState(),
            "frame_rate_buffer": [],
        }
        for _ in cameras
    ]

    recorder = None
    if args.record:
        combined_width = user_res[0] * len(cameras)
        recorder = cv2.VideoWriter(
            "demo1.avi",
            cv2.VideoWriter_fourcc(*"MJPG"),
            30,
            (combined_width, user_res[1]),
        )

    fps_avg_len = 200

    while True:
        t_start = time.perf_counter()
        frames_out = []

        for i, (source_type, cap, single_image_frame) in enumerate(cameras):
            ok, frame = read_frame(source_type, cap, single_image_frame)
            if not ok:
                continue  # skip this cam if frame dropped

            if user_res:
                frame = cv2.resize(frame, user_res)

            # --- Your existing YOLO logic, unchanged ---
            s = states[i]
            results = model(frame, verbose=False)
            detections = results[0].boxes
            best_detection = select_best_detection(
                detections, labels, args.thresh, frame.shape, s["tracked_object"]
            )

            s["tracked_object"], s["current_motion_status"], s["motion_hold_counter"] = update_motion(
                best_detection,
                s["tracked_object"],
                s["current_motion_status"],
                s["motion_hold_counter"],
                s["floor_state"],
            )

            status_text = "No tracked object"
            if s["tracked_object"] is not None:
                status_text = f"Tracked: {s['tracked_object']['label']} ({s['current_motion_status']})"

            if source_type != "image":
                t_stop = time.perf_counter()
                frame_rate = 1.0 / max(t_stop - t_start, 1e-6)
                buf = s["frame_rate_buffer"]
                if len(buf) >= fps_avg_len:
                    buf.pop(0)
                buf.append(frame_rate)
                avg_fps = float(np.mean(buf))
                status_text = f"Cam{i} | {status_text} | FPS: {avg_fps:.2f}"

            draw_detection(frame, s["tracked_object"], status_text, s["floor_state"])
            frames_out.append(frame)

        # --- Combine and show all cameras ---
        if frames_out:
            combined = cv2.hconcat(frames_out)
            cv2.imshow("YOLO detection results", combined)
            if recorder is not None:
                recorder.write(combined)

        key = cv2.waitKey(5) & 0xFF
        if key == ord("q"):
            break
        if key == ord("p"):
            cv2.imwrite("capture.png", combined if frames_out else np.zeros((1,1,3)))

    for _, cap, _ in cameras:
        if cap is not None:
            cap.release()
    if recorder is not None:
        recorder.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()