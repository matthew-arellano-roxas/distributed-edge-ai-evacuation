#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MEDIA_MTX_HOST="${MEDIA_MTX_HOST:-127.0.0.1}"
MEDIA_MTX_PORT="${MEDIA_MTX_PORT:-8554}"
WEBCAM1_DEVICE="${WEBCAM1_DEVICE:-/dev/video0}"
WEBCAM2_DEVICE="${WEBCAM2_DEVICE:-/dev/video2}"
WEBCAM_RESOLUTION="${WEBCAM_RESOLUTION:-640x480}"
WEBCAM_FRAMERATE="${WEBCAM_FRAMERATE:-20}"
WEBCAM1_PATH="${WEBCAM1_PATH:-pi5-cam-2}"
WEBCAM2_PATH="${WEBCAM2_PATH:-pi5-cam-3}"
MODEL_PATH="${MODEL_PATH:-my_model.pt}"
YOLO_THRESH="${YOLO_THRESH:-0.5}"
YOLO_RESOLUTION="${YOLO_RESOLUTION:-640x480}"
RUN_YOLO="${RUN_YOLO:-0}"
START_MEDIAMTX="${START_MEDIAMTX:-1}"

pids=()

cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}

trap cleanup EXIT INT TERM

start_background() {
  "$@" &
  pids+=("$!")
}

if [[ "${START_MEDIAMTX}" == "1" ]]; then
  echo "Starting MediaMTX..."
  (cd "${REPO_ROOT}" && docker compose up -d mediamtx)
fi

echo "Publishing webcam 1 from ${WEBCAM1_DEVICE} to rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM1_PATH}"
start_background ffmpeg \
  -f v4l2 \
  -framerate "${WEBCAM_FRAMERATE}" \
  -video_size "${WEBCAM_RESOLUTION}" \
  -i "${WEBCAM1_DEVICE}" \
  -an \
  -vcodec libx264 \
  -preset veryfast \
  -tune zerolatency \
  -rtsp_transport tcp \
  -f rtsp \
  "rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM1_PATH}"

echo "Publishing webcam 2 from ${WEBCAM2_DEVICE} to rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM2_PATH}"
start_background ffmpeg \
  -f v4l2 \
  -framerate "${WEBCAM_FRAMERATE}" \
  -video_size "${WEBCAM_RESOLUTION}" \
  -i "${WEBCAM2_DEVICE}" \
  -an \
  -vcodec libx264 \
  -preset veryfast \
  -tune zerolatency \
  -rtsp_transport tcp \
  -f rtsp \
  "rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM2_PATH}"

echo "Streams should be available at:"
echo "  rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM1_PATH}"
echo "  rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM2_PATH}"
echo "  http://${MEDIA_MTX_HOST}:8888/${WEBCAM1_PATH}/index.m3u8"
echo "  http://${MEDIA_MTX_HOST}:8888/${WEBCAM2_PATH}/index.m3u8"

if [[ "${RUN_YOLO}" == "1" ]]; then
  echo "Starting YOLO on webcam 1 stream..."
  start_background python3 "${SCRIPT_DIR}/yolo_detect.py" \
    --model "${SCRIPT_DIR}/${MODEL_PATH}" \
    --source "rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM1_PATH}" \
    --thresh "${YOLO_THRESH}" \
    --resolution "${YOLO_RESOLUTION}"

  echo "Starting YOLO on webcam 2 stream..."
  start_background python3 "${SCRIPT_DIR}/yolo_detect.py" \
    --model "${SCRIPT_DIR}/${MODEL_PATH}" \
    --source "rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM2_PATH}" \
    --thresh "${YOLO_THRESH}" \
    --resolution "${YOLO_RESOLUTION}"
fi

wait
