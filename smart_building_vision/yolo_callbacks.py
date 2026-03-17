def on_object_closing_in(detection_info):
    print(
        f"[CALLBACK] Object closing in: {detection_info['label']} "
        f"(confidence={detection_info['confidence']:.2f}, area={int(detection_info['area'])})"
    )


def on_object_moving_away(detection_info):
    print(
        f"[CALLBACK] Object moving away: {detection_info['label']} "
        f"(confidence={detection_info['confidence']:.2f}, area={int(detection_info['area'])})"
    )


def on_object_out_of_view(last_detection_info):
    print(
        f"[CALLBACK] Object out of view: {last_detection_info['label']} "
        f"(last_confidence={last_detection_info['confidence']:.2f}, "
        f"last_area={int(last_detection_info['area'])})"
    )


def on_enter_elevator(count, detection_info):
    print(f"[COUNT] Entered elevator: total_entered={count} ({detection_info['label']})")


def on_exit_elevator(count, detection_info):
    print(f"[COUNT] Exited elevator to floor: total_exited={count} ({detection_info['label']})")


def on_enter_floor(count, detection_info):
    print(f"[COUNT] Entered floor: total_entered_floor={count} ({detection_info['label']})")


def on_exit_floor(count, detection_info):
    print(f"[COUNT] Exited floor: total_exited_floor={count} ({detection_info['label']})")
