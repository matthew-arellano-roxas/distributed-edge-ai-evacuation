#!/usr/bin/env bash

set -euo pipefail

MODEL_PATH="${MODEL_PATH:-my_model.pt}"
MEDIA_MTX_HOST="${MEDIA_MTX_HOST:-127.0.0.1}"
MEDIA_MTX_PORT="${MEDIA_MTX_PORT:-8554}"
YOLO_THRESH="${YOLO_THRESH:-0.5}"
YOLO_RESOLUTION="${YOLO_RESOLUTION:-640x480}"
WEBCAM1_PATH="${WEBCAM1_PATH:-pi5-cam-2}"
WEBCAM2_PATH="${WEBCAM2_PATH:-pi5-cam-3}"

cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "Running YOLO on rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM1_PATH}"
python3 yolo_detect.py \
  --model "${MODEL_PATH}" \
  --source "rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM1_PATH}" \
  --thresh "${YOLO_THRESH}" \
  --resolution "${YOLO_RESOLUTION}" &

echo "Running YOLO on rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM2_PATH}"
python3 yolo_detect.py \
  --model "${MODEL_PATH}" \
  --source "rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM2_PATH}" \
  --thresh "${YOLO_THRESH}" \
  --resolution "${YOLO_RESOLUTION}" &

wait
