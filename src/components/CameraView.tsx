import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Pose } from '../types';

interface CameraViewProps {
  onPoseDetected: (pose: Pose) => void;
  isActive: boolean;
  /** 发送帧率间隔（ms），默认 100。跳绳建议 80，深蹲/仰卧起坐建议 120 */
  throttleMs?: number;
}

// ── WebView 内嵌 HTML：MediaPipe Pose + Camera ──
const MEDIAPIPE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <script src="https://registry.npmmirror.com/@mediapipe/camera_utils/files/camera_utils.js" crossorigin="anonymous"></script>
  <script src="https://registry.npmmirror.com/@mediapipe/drawing_utils/files/drawing_utils.js" crossorigin="anonymous"></script>
  <script src="https://registry.npmmirror.com/@mediapipe/pose/files/pose.js" crossorigin="anonymous"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    #video { display: none; }
    #canvas { width: 100%; height: 100%; display: block; }
  </style>
</head>
<body>
  <video id="video" playsinline autoplay muted></video>
  <canvas id="canvas"></canvas>
  <script>
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    const KEYPOINT_NAMES = [
      'nose','left_eye','right_eye','left_ear','right_ear',
      'left_shoulder','right_shoulder','left_elbow','right_elbow',
      'left_wrist','right_wrist','left_hip','right_hip',
      'left_knee','right_knee','left_ankle','right_ankle'
    ];

    const SKELETON_CONNECTIONS = [
      [11,12],[11,13],[13,15],[12,14],[14,16],
      [11,23],[12,24],[23,24],
      [23,25],[25,27],[24,26],[26,28]
    ];

    let poseInstance = null;
    let cameraInstance = null;
    let lastPoseData = null;
    let sendInterval = 100;
    let lastSendTime = 0;
    let isReady = false;

    function post(type, data) {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, data }));
      } catch(e) {}
    }

    function drawResults(results) {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // 镜像绘制视频帧
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-W, 0);
      ctx.drawImage(results.image, 0, 0, W, H);
      ctx.restore();

      if (!results.poseLandmarks) {
        lastPoseData = null;
        return;
      }

      const lm = results.poseLandmarks;

      // 绘制骨架线
      ctx.strokeStyle = '#00FF88';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (const [i, j] of SKELETON_CONNECTIONS) {
        const a = lm[i], b = lm[j];
        if (a.visibility > 0.3 && b.visibility > 0.3) {
          // 镜像 x 坐标
          const ax = (1 - a.x) * W, ay = a.y * H;
          const bx = (1 - b.x) * W, by = b.y * H;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }

      // 绘制关键点
      for (let i = 0; i < lm.length; i++) {
        if (lm[i].visibility > 0.3) {
          const x = (1 - lm[i].x) * W;
          const y = lm[i].y * H;
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = i <= 10 ? '#FF3B30' : '#FFD60A';
          ctx.fill();
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // 构建发送数据
      lastPoseData = {
        keypoints: lm.map((pt, idx) => ({
          x: (1 - pt.x) * W,
          y: pt.y * H,
          score: pt.visibility,
          name: KEYPOINT_NAMES[idx] || ('kp_' + idx)
        })),
        score: 0.9
      };
    }

    async function init() {
      try {
        post('log', 'Creating Pose instance...');

        poseInstance = new Pose({
          locateFile: (file) => 'https://registry.npmmirror.com/@mediapipe/pose/files/' + file
        });

        poseInstance.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        poseInstance.onResults(drawResults);

        post('log', 'Pose instance created, initializing...');

        // 设置 canvas 尺寸
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // 初始化 Pose 模型（下载 WASM + 模型文件）
        await poseInstance.initialize();
        post('log', 'Pose model initialized');

        // 启动摄像头
        cameraInstance = new Camera(video, {
          onFrame: async () => {
            if (poseInstance) {
              await poseInstance.send({ image: video });
            }
          },
          width: 480,
          height: 360,
          facingMode: 'user'
        });

        await cameraInstance.start();
        post('log', 'Camera started');

        isReady = true;
        post('ready', null);

      } catch (err) {
        console.error('initMediaPipe error:', err);
        post('error', err.message || String(err));
      }
    }

    // 帧发送定时器
    setInterval(() => {
      if (!isReady || !lastPoseData) return;
      const now = Date.now();
      if (now - lastSendTime >= sendInterval) {
        lastSendTime = now;
        post('pose', lastPoseData);
      }
    }, 50);

    // 监听 RN 消息
    window.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'setThrottle' && typeof msg.interval === 'number') {
          sendInterval = Math.max(50, Math.min(300, msg.interval));
        }
      } catch (e) {}
    });

    // 页面加载后初始化
    init();
  </script>
</body>
</html>
`;

type CameraState = 'idle' | 'loading' | 'ready' | 'error';

export default function CameraView({ onPoseDetected, isActive, throttleMs = 100 }: CameraViewProps) {
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const webViewRef = useRef<WebView>(null);
  const isMountedRef = useRef(true);

  // 组件挂载后立即设为 loading
  useEffect(() => {
    isMountedRef.current = true;
    setCameraState('loading');
    return () => { isMountedRef.current = false; };
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      switch (message.type) {
        case 'pose':
          if (message.data && isActive) {
            onPoseDetected(message.data);
          }
          break;
        case 'ready':
          if (isMountedRef.current) setCameraState('ready');
          break;
        case 'error':
          console.warn('[CameraView] MediaPipe error:', message.data);
          if (isMountedRef.current) setCameraState('error');
          break;
        case 'log':
          console.log('[CameraView]', message.data);
          break;
      }
    } catch (err) {
      // 忽略非 JSON 消息
    }
  }, [onPoseDetected, isActive]);

  const handleOpenSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  return (
    <View style={styles.container}>
      {/* WebView 始终挂载 — 进入训练页即加载 MediaPipe */}
      <WebView
        ref={webViewRef}
        source={{ html: MEDIAPIPE_HTML }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowFileAccessNetworking={true}
        startInLoadingState={false}
        onMessage={handleMessage}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        sharedCookiesEnabled={false}
        originWhitelist={['*']}
        // 只在 WebView 完全加载后注入帧率配置
        onLoadEnd={() => {
          webViewRef.current?.injectJavaScript(
            `window.postMessage(JSON.stringify({type:'setThrottle',interval:${throttleMs}}), '*');`
          );
        }}
        onError={(syntheticEvent) => {
          console.error('[CameraView] WebView error:', syntheticEvent.nativeEvent);
        }}
        onHttpError={(syntheticEvent) => {
          console.warn('[CameraView] HTTP error:', syntheticEvent.nativeEvent);
        }}
        renderError={() => (
          <View style={styles.overlay}>
            <Text style={styles.errorTitle}>加载失败</Text>
            <Text style={styles.errorText}>请检查网络连接后重试</Text>
          </View>
        )}
      />

      {/* Loading overlay */}
      {cameraState === 'loading' && (
        <View style={styles.overlay}>
          <Text style={styles.loadingTitle}>正在初始化相机</Text>
          <Text style={styles.loadingSub}>首次加载需要下载 AI 模型，请耐心等待...</Text>
        </View>
      )}

      {/* Error overlay */}
      {cameraState === 'error' && (
        <View style={styles.overlay}>
          <Text style={styles.errorTitle}>无法启动相机</Text>
          <Text style={styles.errorText}>请确认已授予相机权限</Text>
          <TouchableOpacity style={styles.settingsButton} onPress={handleOpenSettings}>
            <Text style={styles.settingsButtonText}>打开设置</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setCameraState('loading')}
          >
            <Text style={styles.retryButtonText}>重试</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Idle overlay（训练未开始时半透明遮罩） */}
      {cameraState === 'ready' && !isActive && (
        <View style={[styles.overlay, styles.idleOverlay]}>
          <Text style={styles.idleText}>相机就绪，点击「开始」进行训练</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 1,
  },
  idleOverlay: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  loadingTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  loadingSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    marginBottom: 20,
    textAlign: 'center',
  },
  settingsButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  settingsButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  retryButton: {
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  retryButtonText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '500',
  },
  idleText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 40,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
