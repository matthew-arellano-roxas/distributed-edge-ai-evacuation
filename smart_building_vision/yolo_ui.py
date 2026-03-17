import cv2

from yolo_config import SETTINGS
from yolo_tracking import compute_lane_bounds


def draw_detection(frame, detection, status_text, floor_state):
    lane_bounds = compute_lane_bounds(frame.shape)
    cv2.rectangle(
        frame,
        (lane_bounds["left"], lane_bounds["top"]),
        (lane_bounds["right"], lane_bounds["bottom"]),
        (255, 200, 0),
        1,
    )
    cv2.line(frame, (lane_bounds["left"], lane_bounds["entry_y"]), (lane_bounds["right"], lane_bounds["entry_y"]), (0, 200, 0), 1)
    cv2.line(frame, (lane_bounds["left"], lane_bounds["exit_y"]), (lane_bounds["right"], lane_bounds["exit_y"]), (0, 120, 255), 1)

    if detection is not None:
        xmin, ymin, xmax, ymax = detection["bbox"]
        color = (68, 148, 228)
        cv2.rectangle(frame, (xmin, ymin), (xmax, ymax), color, 2)

        label = f"{detection['label']}: {int(detection['confidence'] * 100)}%"
        label_size, base_line = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        label_ymin = max(ymin, label_size[1] + 10)
        cv2.rectangle(
            frame,
            (xmin, label_ymin - label_size[1] - 10),
            (xmin + label_size[0], label_ymin + base_line - 10),
            color,
            cv2.FILLED,
        )
        cv2.putText(
            frame,
            label,
            (xmin, label_ymin - 7),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 0),
            1,
        )

    cv2.putText(frame, status_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
    count_text = (
        f"Entered: {floor_state.entered_count}  "
        f"Exited: {floor_state.exited_count}  "
        f"Last: {floor_state.last_confirmed_direction}"
    )
    cv2.putText(frame, count_text, (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    if SETTINGS.show_debug_overlay and detection is not None:
        debug_text = (
            f"y={detection.get('center_y', 0.0):.0f} "
            f"vr={detection.get('vertical_ratio', 0.0):.3f} "
            f"ar={detection.get('area_ratio', 0.0):.3f} "
            f"cf={detection.get('closing_frames', 0)} "
            f"mf={detection.get('moving_away_frames', 0)}"
        )
        cv2.putText(frame, debug_text, (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
