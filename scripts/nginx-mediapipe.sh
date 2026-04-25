#!/bin/bash
# nginx-mediapipe.sh — 为 gakiwoo.com 添加 MediaPipe location 配置
# 使用方式: bash scripts/nginx-mediapipe.sh

set -e

# 通过 SSH_ASKPASS 提供密码（避免密码硬编码）
export SSH_ASKPASS_REQUIRE="force"
export DISPLAY="dummy"

run_ssh() {
    ssh -o StrictHostKeyChecking=no -o BatchMode=no "$@"
}

run_scp() {
    scp -o StrictHostKeyChecking=no -o BatchMode=no "$@"
}

REMOTE_USER="root"
REMOTE_HOST="gakiwoo.com"
NGINX_CONF="/etc/nginx/sites-enabled/gakiwoo.com"

echo "=== 备份 Nginx 配置 ==="
run_ssh "${REMOTE_USER}@${REMOTE_HOST}" \
  "cp ${NGINX_CONF} ${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
echo "  OK 备份完成"

echo "=== 插入 MediaPipe location 到 /api/ location 之前 ==="
run_ssh "${REMOTE_USER}@${REMOTE_HOST}" python3 << 'PYEOF'
import re

conf_path = '/etc/nginx/sites-enabled/gakiwoo.com'
with open(conf_path, 'r', encoding='utf-8') as f:
    content = f.read()

mediapipe_block = '''
    # ===== MediaPipe Pose 静态文件 (WASM/模型) =====
    location /static/mediapipe/ {
        alias /var/www/gakiwoo/static/mediapipe/;

        # CORS：允许所有来源跨域访问
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Range" always;

        # 缓存：WASM/模型文件长期不变，缓存 30 天
        add_header Cache-Control "public, max-age=2592000, immutable";

        # MIME 类型
        types {
            application/javascript  js;
            application/wasm        wasm;
            application/octet-stream data tflite binarypb;
        }

        # 大文件支持
        client_max_body_size 10m;
        access_log off;
    }

'''

# 在 location /api/ 之前插入
pattern = r'(\n    location /api/)'
if re.search(pattern, content):
    new_content = re.sub(pattern, mediapipe_block + r'\1', content, count=1)
    with open(conf_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('MediaPipe location 插入成功')
else:
    print('ERROR: location /api/ 未找到')
    exit(1)
PYEOF

echo "=== 更新 CSP 头以允许 gakiwoo.com CDN ==="
run_ssh "${REMOTE_USER}@${REMOTE_HOST}" python3 << 'PYEOF2'
conf_path = '/etc/nginx/sites-enabled/gakiwoo.com'
with open(conf_path, 'r', encoding='utf-8') as f:
    content = f.read()

# connect-src 添加 gakiwoo.com/static/mediapipe
old_csp = "connect-src 'self' https://gakiwoo.com https://api.minimaxi.com;"
new_csp = "connect-src 'self' https://gakiwoo.com https://api.minimaxi.com https://gakiwoo.com/static/mediapipe/;"
if old_csp in content:
    content = content.replace(old_csp, new_csp)
    print('CSP connect-src 更新成功')

# script-src 添加 gakiwoo.com
old_script = "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;"
new_script = "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://gakiwoo.com;"
if old_script in content:
    content = content.replace(old_script, new_script)
    print('CSP script-src 更新成功')

with open(conf_path, 'w', encoding='utf-8') as f:
    f.write(content)
PYEOF2

echo "=== 测试 Nginx 配置 ==="
run_ssh "${REMOTE_USER}@${REMOTE_HOST}" "nginx -t" 2>&1

echo "=== 重载 Nginx ==="
run_ssh "${REMOTE_USER}@${REMOTE_HOST}" "nginx -s reload"
echo "  OK Nginx 已重载"

echo "=== 验证文件可访问性 ==="
run_ssh "${REMOTE_USER}@${REMOTE_HOST}" \
  "curl -sI https://gakiwoo.com/static/mediapipe/pose/pose.js | head -6"
echo ""
echo "=== 完成 ==="
echo "验证 URL:"
echo "  https://gakiwoo.com/static/mediapipe/pose/pose.js"
echo "  https://gakiwoo.com/static/mediapipe/pose/pose_solution_simd_wasm_bin.wasm"