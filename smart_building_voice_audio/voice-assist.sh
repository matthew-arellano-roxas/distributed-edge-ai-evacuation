#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENV_DIR="${PROJECT_ROOT}/smart_building_voice_audio/venv"
PYTHON_BIN="${VENV_DIR}/bin/python"
ENV_FILE="${SCRIPT_DIR}/.env"
TARGET_SCRIPT="${SCRIPT_DIR}/play_mqtt_alerts.py"

if [[ ! -f "${TARGET_SCRIPT}" ]]; then
  echo "[voice-assist] Missing script: ${TARGET_SCRIPT}" >&2
  exit 1
fi

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "[voice-assist] Missing virtualenv python: ${PYTHON_BIN}" >&2
  echo "[voice-assist] Create it first with: python3 -m venv ${VENV_DIR}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[voice-assist] Missing env file: ${ENV_FILE}" >&2
  echo "[voice-assist] Copy .env.example to .env and set MQTT_HOST before running." >&2
  exit 1
fi

echo "[voice-assist] Starting MQTT voice alerts..."
echo "[voice-assist] Using script: ${TARGET_SCRIPT}"
echo "[voice-assist] Using env: ${ENV_FILE}"

cd "${SCRIPT_DIR}"
exec "${PYTHON_BIN}" "${TARGET_SCRIPT}" "$@"
