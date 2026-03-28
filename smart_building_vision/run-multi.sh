#!/bin/bash
sleep 5

BASE_DIR="/home/rasp5/distributed-edge-ai-evacuation/smart_building_vision"
PYTHON="$BASE_DIR/venv/bin/python"
SCRIPT="$BASE_DIR/yolo_stream.py"
MODEL="my_model.pt"

# 🔥 Kill existing processes (important)
pkill -f yolo_stream.py 2>/dev/null

# OR kill ports directly
fuser -k 5001/tcp 2>/dev/null
fuser -k 5002/tcp 2>/dev/null

sleep 1

# Camera 1
$PYTHON $SCRIPT --model $MODEL --source /dev/video0 --port 5001 --resolution 640x480 &

# Camera 2
$PYTHON $SCRIPT --model $MODEL --source /dev/video2 --port 5002 --resolution 640x480 &

wait