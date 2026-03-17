from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    recognition_enabled: bool = False
    combine_all_classes: bool = True
    combined_class_name: str = "object"
    target_label: str | None = None
    movement_ratio_threshold: float = 0.008
    area_smoothing: float = 0.50
    max_center_shift: int = 160
    motion_status_hold_frames: int = 6
    motion_confirm_frames: int = 3
    prefer_center_tracking: bool = True
    center_bias_strength: float = 0.35
    bottom_bias_strength: float = 0.25
    bottom_approach_weight: float = 0.01
    vertical_motion_weight: float = 1.00
    moving_away_weight: float = 1.00
    idle_area_threshold: float = 0.010
    idle_vertical_threshold: float = 0.015
    show_debug_overlay: bool = True
    lane_left_ratio: float = 0.20
    lane_right_ratio: float = 0.80
    lane_top_ratio: float = 0.22
    lane_bottom_ratio: float = 0.98
    entry_zone_ratio: float = 0.78
    exit_zone_ratio: float = 0.48
    missing_frame_threshold: int = 3


@dataclass
class FloorState:
    entered_count: int = 0
    exited_count: int = 0
    last_confirmed_direction: str = "idle"
    deepest_center_ratio: float = 0.0
    highest_center_ratio: float = 1.0
    missing_frames: int = 0

    def reset_tracking_memory(self) -> None:
        self.last_confirmed_direction = "idle"
        self.deepest_center_ratio = 0.0
        self.highest_center_ratio = 1.0
        self.missing_frames = 0


SETTINGS = Settings()
