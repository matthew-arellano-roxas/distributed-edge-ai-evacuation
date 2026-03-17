import numpy as np

from yolo_callbacks import (
    on_enter_floor,
    on_exit_floor,
    on_object_closing_in,
    on_object_moving_away,
    on_object_out_of_view,
)
from yolo_config import SETTINGS


def get_box_center(bbox):
    xmin, ymin, xmax, ymax = bbox
    return ((xmin + xmax) / 2.0, (ymin + ymax) / 2.0)


def compute_lane_bounds(frame_shape):
    frame_height, frame_width = frame_shape[:2]
    return {
        "left": int(frame_width * SETTINGS.lane_left_ratio),
        "right": int(frame_width * SETTINGS.lane_right_ratio),
        "top": int(frame_height * SETTINGS.lane_top_ratio),
        "bottom": int(frame_height * SETTINGS.lane_bottom_ratio),
        "entry_y": int(frame_height * SETTINGS.entry_zone_ratio),
        "exit_y": int(frame_height * SETTINGS.exit_zone_ratio),
    }


def bbox_in_lane(bbox, lane_bounds):
    center_x, center_y = get_box_center(bbox)
    return (
        lane_bounds["left"] <= center_x <= lane_bounds["right"]
        and lane_bounds["top"] <= center_y <= lane_bounds["bottom"]
    )


def _resolve_display_name(class_name):
    if SETTINGS.combine_all_classes:
        return SETTINGS.combined_class_name
    return class_name if SETTINGS.recognition_enabled else "object"


def select_best_detection(detections, labels, min_thresh, frame_shape, tracked_object):
    best_detection = None
    frame_height, frame_width = frame_shape[:2]
    frame_center_x = frame_width / 2.0
    frame_bottom_y = float(frame_height)
    lane_bounds = compute_lane_bounds(frame_shape)
    tracked_center = None
    if tracked_object is not None:
        tracked_center = get_box_center(tracked_object["bbox"])

    for detection in detections:
        conf = float(detection.conf.item())
        if conf < min_thresh:
            continue

        bbox = detection.xyxy.cpu().numpy().squeeze().astype(int)
        xmin, ymin, xmax, ymax = bbox
        class_idx = int(detection.cls.item())
        class_name = labels[class_idx]

        if SETTINGS.target_label and class_name != SETTINGS.target_label:
            continue
        if not bbox_in_lane((xmin, ymin, xmax, ymax), lane_bounds):
            continue

        area = max(0, xmax - xmin) * max(0, ymax - ymin)
        center_x, center_y = get_box_center((xmin, ymin, xmax, ymax))
        center_distance = abs(center_x - frame_center_x) / max(frame_width / 2.0, 1.0)
        bottom_distance = abs(frame_bottom_y - ymax) / max(frame_height, 1.0)
        score = float(area)
        if SETTINGS.prefer_center_tracking:
            score *= max(0.1, 1.0 - SETTINGS.center_bias_strength * center_distance)
            score *= max(0.1, 1.0 - SETTINGS.bottom_bias_strength * bottom_distance)
        if tracked_center is not None:
            tracking_distance = np.hypot(center_x - tracked_center[0], center_y - tracked_center[1])
            score *= max(0.2, 1.0 - (tracking_distance / SETTINGS.max_center_shift) * 0.5)

        candidate = {
            "label": _resolve_display_name(class_name),
            "class_name": class_name,
            "confidence": conf,
            "bbox": (xmin, ymin, xmax, ymax),
            "area": float(area),
            "score": score,
            "frame_height": float(frame_height),
            "center_y": float(center_y),
            "lane_bounds": lane_bounds,
        }

        if best_detection is None or candidate["score"] > best_detection["score"]:
            best_detection = candidate

    return best_detection


def update_motion(best_detection, tracked_object, current_motion_status, hold_counter, floor_state):
    if best_detection is None:
        if tracked_object is not None:
            floor_state.missing_frames += 1
            if floor_state.missing_frames >= SETTINGS.missing_frame_threshold:
                on_object_out_of_view(tracked_object)
                if (
                    floor_state.last_confirmed_direction == "closing_in"
                    and floor_state.deepest_center_ratio >= SETTINGS.entry_zone_ratio
                ):
                    floor_state.exited_count += 1
                    on_exit_floor(floor_state.exited_count, tracked_object)
                elif (
                    floor_state.last_confirmed_direction == "moving_away"
                    and floor_state.highest_center_ratio <= SETTINGS.exit_zone_ratio
                ):
                    floor_state.entered_count += 1
                    on_enter_floor(floor_state.entered_count, tracked_object)
                floor_state.reset_tracking_memory()
                return None, "idle", 0
            return tracked_object, current_motion_status, hold_counter
        return None, "idle", 0

    floor_state.missing_frames = 0

    if tracked_object is None:
        best_detection["smoothed_area"] = best_detection["area"]
        best_detection["closing_frames"] = 0
        best_detection["moving_away_frames"] = 0
        current_center_ratio = best_detection["center_y"] / max(best_detection["frame_height"], 1.0)
        floor_state.deepest_center_ratio = current_center_ratio
        floor_state.highest_center_ratio = current_center_ratio
        return best_detection, "idle", 0

    prev_center = get_box_center(tracked_object["bbox"])
    curr_center = get_box_center(best_detection["bbox"])
    center_shift = np.hypot(curr_center[0] - prev_center[0], curr_center[1] - prev_center[1])
    vertical_shift = curr_center[1] - prev_center[1]

    prev_smoothed_area = tracked_object["smoothed_area"]
    curr_smoothed_area = (
        (1.0 - SETTINGS.area_smoothing) * prev_smoothed_area
        + SETTINGS.area_smoothing * best_detection["area"]
    )
    area_ratio = (curr_smoothed_area - prev_smoothed_area) / max(prev_smoothed_area, 1.0)
    best_detection["smoothed_area"] = curr_smoothed_area
    frame_height = max(best_detection.get("frame_height", 1.0), 1.0)
    vertical_ratio = vertical_shift / frame_height
    bottom_ratio = best_detection["bbox"][3] / frame_height
    center_ratio = best_detection["center_y"] / frame_height
    floor_state.deepest_center_ratio = max(floor_state.deepest_center_ratio, center_ratio)
    floor_state.highest_center_ratio = min(floor_state.highest_center_ratio, center_ratio)
    best_detection["vertical_ratio"] = vertical_ratio
    best_detection["area_ratio"] = area_ratio
    approach_bonus = max(0.0, bottom_ratio - 0.60) * SETTINGS.bottom_approach_weight
    closing_signal = max(0.0, vertical_ratio) * SETTINGS.vertical_motion_weight + max(0.0, area_ratio) * 0.15 + approach_bonus
    moving_away_signal = max(0.0, -vertical_ratio) * SETTINGS.moving_away_weight + max(0.0, -area_ratio) * 0.15

    closing_frames = tracked_object.get("closing_frames", 0)
    moving_away_frames = tracked_object.get("moving_away_frames", 0)

    if closing_signal >= SETTINGS.movement_ratio_threshold and closing_signal > moving_away_signal:
        closing_frames += 1
        moving_away_frames = 0
    elif moving_away_signal >= SETTINGS.movement_ratio_threshold and moving_away_signal > closing_signal:
        moving_away_frames += 1
        closing_frames = 0
    elif (
        abs(area_ratio) <= SETTINGS.idle_area_threshold
        and abs(vertical_ratio) <= SETTINGS.idle_vertical_threshold
    ):
        closing_frames = 0
        moving_away_frames = 0
    else:
        closing_frames = max(0, closing_frames - 1)
        moving_away_frames = max(0, moving_away_frames - 1)

    best_detection["closing_frames"] = closing_frames
    best_detection["moving_away_frames"] = moving_away_frames

    new_status = current_motion_status
    new_hold_counter = hold_counter

    if center_shift <= SETTINGS.max_center_shift:
        if moving_away_frames >= SETTINGS.motion_confirm_frames:
            if current_motion_status != "moving_away":
                on_object_moving_away(best_detection)
            floor_state.last_confirmed_direction = "moving_away"
            new_status = "moving_away"
            new_hold_counter = SETTINGS.motion_status_hold_frames
            best_detection["closing_frames"] = 0
            best_detection["moving_away_frames"] = 0
        elif closing_frames >= SETTINGS.motion_confirm_frames:
            if current_motion_status != "closing_in":
                on_object_closing_in(best_detection)
            floor_state.last_confirmed_direction = "closing_in"
            new_status = "closing_in"
            new_hold_counter = SETTINGS.motion_status_hold_frames
            best_detection["closing_frames"] = 0
            best_detection["moving_away_frames"] = 0
        elif hold_counter > 0:
            new_hold_counter = hold_counter - 1
        elif (
            abs(area_ratio) <= SETTINGS.idle_area_threshold
            and abs(vertical_ratio) <= SETTINGS.idle_vertical_threshold
        ):
            new_status = "idle"
        else:
            new_status = "idle"
    elif hold_counter > 0:
        new_hold_counter = hold_counter - 1
    else:
        new_status = "idle"
        best_detection["closing_frames"] = 0
        best_detection["moving_away_frames"] = 0

    return best_detection, new_status, new_hold_counter
