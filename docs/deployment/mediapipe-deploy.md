# gakiwoo.com MediaPipe 静态文件托管

## 上传文件

将 `mediapipe-upload/pose/` 目录下的 **9 个文件** 上传到服务器：

```
/var/www/gakiwoo/static/mediapipe/pose/
├── pose.js                                    (47KB)
├── pose_solution_packed_assets_loader.js      (8KB)
├── pose_solution_packed_assets.data           (2.8MB)
├── pose_solution_simd_wasm_bin.js             (276KB)
├── pose_solution_simd_wasm_bin.wasm           (5.8MB)
├── pose_solution_wasm_bin.js                  (276KB)
├── pose_solution_wasm_bin.wasm                (5.7MB)
├── pose_landmark_full.tflite                  (6.1MB)
└── pose_web.binarypb                          (1KB)
```

**总计约 21MB**

## 上传命令（从本地执行）

```bash
# 用 scp 上传整个目录
scp -r mediapipe-upload/pose/ user@gakiwoo.com:/var/www/gakiwoo/static/mediapipe/pose/
```

## Nginx 配置

在 gakiwoo.com 的 server block 中添加：

```nginx
# MediaPipe Pose 静态文件 — 需要跨域和正确的 MIME 类型
location /static/mediapipe/ {
    alias /var/www/gakiwoo/static/mediapipe/;
    
    # CORS：允许 WebView 从 https://localhost 加载
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Range" always;
    
    # 缓存：WASM/模型文件很少变化，缓存 30 天
    add_header Cache-Control "public, max-age=2592000, immutable";
    
    # MIME 类型
    types {
        application/javascript  js;
        application/wasm        wasm;
        application/octet-stream data tflite binarypb;
    }
    
    # 大文件支持（模型文件最大 6MB）
    client_max_body_size 10m;
}
```

配置完成后：

```bash
# 测试 Nginx 配置
sudo nginx -t

# 重新加载
sudo nginx -s reload
```

## 验证

上传后，用浏览器访问以下 URL 确认文件可访问：

- https://gakiwoo.com/static/mediapipe/pose/pose.js → 应该返回 JS 文件
- https://gakiwoo.com/static/mediapipe/pose/pose_solution_simd_wasm_bin.wasm → 应该返回 WASM 文件

**关键**：检查响应头中必须包含 `Access-Control-Allow-Origin: *`，否则 WebView 跨域请求会被浏览器阻止。

## 安全说明

- 这些是**公开的 npm 包文件**（@mediapipe/pose），不包含任何私有信息
- 所有文件原始来源：https://www.npmjs.com/package/@mediapipe/pose
- Cache-Control 设为 30 天可以大幅减少重复下载，用户只需首次加载约 21MB
