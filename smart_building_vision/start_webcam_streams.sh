#!/usr/bin/env bash

set -euo pipefail

MEDIA_MTX_HOST="${MEDIA_MTX_HOST:-127.0.0.1}"
MEDIA_MTX_PORT="${MEDIA_MTX_PORT:-8554}"
WEBCAM1_DEVICE="${WEBCAM1_DEVICE:-/dev/video0}"
WEBCAM2_DEVICE="${WEBCAM2_DEVICE:-/dev/video2}"
WEBCAM_RESOLUTION="${WEBCAM_RESOLUTION:-640x480}"
WEBCAM_FRAMERATE="${WEBCAM_FRAMERATE:-20}"
WEBCAM1_PATH="${WEBCAM1_PATH:-pi5-cam-2}"
WEBCAM2_PATH="${WEBCAM2_PATH:-pi5-cam-3}"

cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "Starting webcam stream 1 from ${WEBCAM1_DEVICE} to rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM1_PATH}"
ffmpeg \
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
  "rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM1_PATH}" &

echo "Starting webcam stream 2 from ${WEBCAM2_DEVICE} to rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM2_PATH}"
ffmpeg \
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
  "rtsp://${MEDIA_MTX_HOST}:${MEDIA_MTX_PORT}/${WEBCAM2_PATH}" &

wait
