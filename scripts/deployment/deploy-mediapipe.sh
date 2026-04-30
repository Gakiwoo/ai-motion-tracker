#!/bin/bash
# deploy-mediapipe.sh — 将 MediaPipe 静态文件部署到 gakiwoo.com
#
# 前提：本机已配置 SSH 到 gakiwoo.com
# 用法：bash scripts/deployment/deploy-mediapipe.sh

set -e

REMOTE_USER="root"  # 按实际修改
REMOTE_HOST="gakiwoo.com"
REMOTE_DIR="/var/www/gakiwoo/static/mediapipe/pose/"
LOCAL_DIR="$(dirname "$0")/../../mediapipe-upload/pose/"

echo "=== AI Sport MediaPipe 部署 ==="
echo ""
echo "本地目录: $LOCAL_DIR"
echo "远程目录: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
echo ""

# 1. 确认文件存在
echo "[1/4] 检查本地文件..."
FILE_COUNT=$(ls -1 "$LOCAL_DIR" | wc -l)
if [ "$FILE_COUNT" -lt 9 ]; then
    echo "ERROR: 本地文件不足 9 个（当前 $FILE_COUNT 个），请检查 mediapipe-upload/pose/"
    exit 1
fi
echo "  OK 找到 $FILE_COUNT 个文件"

# 2. 创建远程目录
echo "[2/4] 创建远程目录..."
ssh "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p $REMOTE_DIR"

# 3. 上传文件
echo "[3/4] 上传文件..."
scp -r "$LOCAL_DIR"* "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"

# 4. 验证
echo "[4/4] 验证远程文件..."
ssh "${REMOTE_USER}@${REMOTE_HOST}" "ls -la $REMOTE_DIR"

echo ""
echo "=== 部署完成 ==="
echo ""
echo "接下来需要配置 Nginx，请参考 mediapipe-upload/README-部署说明.md"
echo ""
echo "验证 URL:"
echo "  https://gakiwoo.com/static/mediapipe/pose/pose.js"
echo "  https://gakiwoo.com/static/mediapipe/pose/pose_solution_simd_wasm_bin.wasm"
