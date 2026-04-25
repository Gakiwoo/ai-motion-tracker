import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform, ScrollView } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Camera } from 'expo-camera';
import { Pose } from '../types';
import { mediaPipeAssetService } from '../services/MediaPipeAssetService';

interface CameraViewProps {
  onPoseDetected: (pose: Pose) => void;
  isActive: boolean;
  /** 发送帧率间隔（ms），默认 100。跳绳建议 80，深蹲/仰卧起坐建议 120 */
  throttleMs?: number;
}

// ── WebView 内嵌 HTML：MediaPipe Pose + Camera ──
//
// 架构演进（v3）：
//   v1: 静态 <script src="CDN"> → CDN 失败无容错
//   v2: 动态 createElement('script') + CDN 回退 → 国内 CDN 全挂
//   v3: RN 侧通过 MediaPipeAssetService 缓存文件 → 注入为 blob: URL
//       - blob: URL 与页面同源，无 CORS 问题
//       - 首次从 gakiwoo.com 下载后永久缓存，零网络依赖
//       - CDN 仅作为缓存不存在时的最终回退
//
// 关键约束：
//   - baseUrl 必须是 https://localhost（安全上下文，getUserMedia 需要）
//   - 不能用 file:// URL 加载资源（https→file CORS 阻止）
//   - blob: URL 是唯一能在 https://localhost 页面中加载本地数据的方式
//
// JS 全部使用 var + 字符串拼接（避免 EAS 构建环境模板字符串解析问题）
const MEDIAPIPE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
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
    var video = document.getElementById('video');
    var canvas = document.getElementById('canvas');
    var ctx = canvas.getContext('2d');

    var KEYPOINT_NAMES = [
      'nose','left_eye','right_eye','left_ear','right_ear',
      'left_shoulder','right_shoulder','left_elbow','right_elbow',
      'left_wrist','right_wrist','left_hip','right_hip',
      'left_knee','right_knee','left_ankle','right_ankle'
    ];

    var SKELETON_CONNECTIONS = [
      [11,12],[11,13],[13,15],[12,14],[14,16],
      [11,23],[12,24],[23,24],
      [23,25],[25,27],[24,26],[26,28]
    ];

    var poseInstance = null;
    var lastPoseData = null;
    var sendInterval = 100;
    var lastSendTime = 0;
    var isReady = false;
    var animFrameId = null;
    var shouldProcessPose = false;
    var shouldSendPose = false;

    // blob: URL 注册表（由 RN 注入的本地文件数据创建）
    var blobRegistry = {};

    function post(type, data) {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, data: data }));
      } catch(e) {}
    }

    // ── 由 RN 调用：注册一个 blob URL ──
    // RN 侧通过 injectJavaScript 调用此函数，传入 base64 编码的文件数据
    window.__registerBlob = function(filename, base64Data, mimeType) {
      try {
        var binary = atob(base64Data);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        var blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        blobRegistry[filename] = url;
        post('log', 'Registered blob: ' + filename + ' (' + bytes.length + ' bytes)');
      } catch(e) {
        post('log', 'Failed to register blob: ' + filename + ' - ' + e.message);
      }
    };

    // ── 由 RN 调用：注入并执行 pose.js ──
    window.__evalPoseJs = function(base64Data) {
      try {
        var jsCode = atob(base64Data);
        post('log', 'Evaluating pose.js (' + jsCode.length + ' chars)');
        eval(jsCode);
        post('log', 'pose.js evaluated successfully');
      } catch(e) {
        post('log', 'Failed to eval pose.js: ' + e.message);
        throw e;
      }
    };

    function drawResults(results) {
      var W = canvas.width;
      var H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-W, 0);
      ctx.drawImage(results.image, 0, 0, W, H);
      ctx.restore();

      if (!results.poseLandmarks) {
        lastPoseData = null;
        return;
      }

      var lm = results.poseLandmarks;
      var pts = [];
      for (var i = 0; i < lm.length; i++) {
        pts.push({ x: (1 - lm[i].x) * W, y: lm[i].y * H, v: lm[i].visibility, n: KEYPOINT_NAMES[i] || ('kp_' + i) });
      }

      ctx.strokeStyle = '#00FF88';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (var k = 0; k < SKELETON_CONNECTIONS.length; k++) {
        var pair = SKELETON_CONNECTIONS[k];
        var a = pts[pair[0]], b = pts[pair[1]];
        if (a.v > 0.3 && b.v > 0.3) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (var i = 0; i < pts.length; i++) {
        if (pts[i].v > 0.3) {
          ctx.beginPath();
          ctx.arc(pts[i].x, pts[i].y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = i <= 10 ? '#FF3B30' : '#FFD60A';
          ctx.fill();
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      var keypoints = [];
      for (var j = 0; j < pts.length; j++) {
        keypoints.push({ x: pts[j].x, y: pts[j].y, score: pts[j].v, name: pts[j].n });
      }
      lastPoseData = { keypoints: keypoints, score: 0.9 };
    }

    function drawVideoOnly() {
      if (!video || video.paused || video.ended) return;
      var W = canvas.width;
      var H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-W, 0);
      ctx.drawImage(video, 0, 0, W, H);
      ctx.restore();
    }

    async function startCamera() {
      post('log', 'Checking navigator.mediaDevices...');
      if (!navigator.mediaDevices) {
        throw new Error('navigator.mediaDevices is undefined - page is not a secure context');
      }
      post('log', 'Requesting camera via getUserMedia...');
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      post('log', 'Camera stream obtained, video playing');

      canvas.width = video.videoWidth || 480;
      canvas.height = video.videoHeight || 360;

      function processFrame() {
        if (!video || video.paused || video.ended) {
          animFrameId = requestAnimationFrame(processFrame);
          return;
        }
        if (shouldProcessPose && poseInstance) {
          poseInstance.send({ image: video }).then(function() {
            animFrameId = requestAnimationFrame(processFrame);
          }).catch(function(err) {
            post('log', 'Pose send error: ' + (err.message || String(err)));
            animFrameId = requestAnimationFrame(processFrame);
          });
        } else {
          drawVideoOnly();
          animFrameId = requestAnimationFrame(processFrame);
        }
      }
      animFrameId = requestAnimationFrame(processFrame);
    }

    // ── CDN 回退加载（仅在本地缓存不可用时使用） ──
    var CDN_BASES = [
      'https://gakiwoo.com/static/mediapipe/pose/',
      'https://registry.npmmirror.com/@mediapipe/pose/0.5.1675469404/files/',
      'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/',
      'https://unpkg.com/@mediapipe/pose@0.5.1675469404/'
    ];

    function loadScript(url, timeoutMs) {
      return new Promise(function(resolve, reject) {
        var s = document.createElement('script');
        s.src = url;
        var timer = setTimeout(function() {
          s.onload = null; s.onerror = null;
          if (s.parentNode) s.parentNode.removeChild(s);
          reject(new Error('Script load timeout: ' + url));
        }, timeoutMs || 10000);
        s.onload = function() { clearTimeout(timer); resolve(); };
        s.onerror = function() { clearTimeout(timer); if (s.parentNode) s.parentNode.removeChild(s); reject(new Error('Script load failed: ' + url)); };
        document.head.appendChild(s);
      });
    }

    async function initFromLocal() {
      // 使用 RN 注入的 blob: URL 初始化
      if (typeof Pose === 'undefined') {
        throw new Error('Pose class not loaded - pose.js was not injected');
      }

      post('cdnStatus', '初始化 AI 模型（本地）...');
      post('log', 'Creating Pose instance with local blob URLs');

      poseInstance = new Pose({
        locateFile: function(file) {
          if (blobRegistry[file]) {
            return blobRegistry[file];
          }
          post('log', 'WARNING: No blob for ' + file + ', falling back to CDN');
          return CDN_BASES[0] + file;
        }
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
      post('log', 'Pose instance created, initializing model...');
      await poseInstance.initialize();
      post('log', 'Pose model initialized from local cache');
    }

    async function initFromCdn() {
      // CDN 回退：逐个尝试
      var activeCdnBase = null;
      for (var i = 0; i < CDN_BASES.length; i++) {
        var cdnBase = CDN_BASES[i];
        var scriptUrl = cdnBase + 'pose.js';
        var host = cdnBase.split('/')[2];
        try {
          post('log', 'Loading pose.js from CDN: ' + scriptUrl);
          post('cdnStatus', '尝试 CDN ' + (i + 1) + '/' + CDN_BASES.length + ': ' + host);
          await loadScript(scriptUrl, 10000);
          activeCdnBase = cdnBase;
          post('log', 'pose.js loaded from: ' + host);
          break;
        } catch (e) {
          post('log', 'CDN failed: ' + host + ' - ' + (e.message || String(e)));
        }
      }

      if (!activeCdnBase) {
        throw new Error('All CDN attempts failed. Please check your network connection.');
      }

      if (typeof Pose === 'undefined') {
        throw new Error('Pose class not loaded after CDN script load');
      }

      post('cdnStatus', '初始化 AI 模型（CDN）...');
      poseInstance = new Pose({
        locateFile: function(file) { return activeCdnBase + file; }
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
      await poseInstance.initialize();
      post('log', 'Pose model initialized from CDN: ' + activeCdnBase);
    }

    async function init() {
      try {
        post('log', 'Starting MediaPipe initialization...');
        post('log', 'Blob registry has ' + Object.keys(blobRegistry).length + ' files');

        // 优先使用本地 blob URL（如果 RN 已注入）
        if (Object.keys(blobRegistry).length > 0 && typeof Pose !== 'undefined') {
          await initFromLocal();
        } else if (typeof Pose !== 'undefined') {
          // pose.js 已注入但 blob 不全，仍尝试本地
          await initFromLocal();
        } else {
          // pose.js 未注入 → 回退到 CDN
          post('log', 'Local blobs not available, falling back to CDN');
          await initFromCdn();
        }

        // 检查安全上下文
        if (!navigator.mediaDevices) {
          throw new Error('navigator.mediaDevices is undefined (not a secure context)');
        }

        post('cdnStatus', '启动相机...');
        await startCamera();

        isReady = true;
        post('ready', null);
        post('log', 'Camera and Pose fully ready');
      } catch (err) {
        var errMsg = err.message || String(err);
        post('log', 'Initialization failed: ' + errMsg);
        post('error', errMsg);
      }
    }

    // ── 姿态数据发送（仅在 shouldSendPose 时发送） ──
    var sendIntervalId = null;
    function startSendInterval() {
      if (sendIntervalId) clearInterval(sendIntervalId);
      sendIntervalId = setInterval(function() {
        if (!isReady || !lastPoseData || !shouldSendPose) return;
        var now = Date.now();
        if (now - lastSendTime >= sendInterval) {
          lastSendTime = now;
          post('pose', lastPoseData);
        }
      }, 50);
    }
    startSendInterval();

    // ── 接收 RN 控制消息 ──
    window.addEventListener('message', function(event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === 'setThrottle' && typeof msg.interval === 'number') {
          sendInterval = Math.max(50, Math.min(300, msg.interval));
        }
        if (msg.type === 'setActive') {
          shouldProcessPose = !!msg.active;
          shouldSendPose = !!msg.active;
          post('log', 'Active state changed: ' + msg.active);
        }
      } catch (e) {}
    });

    // init() 由 RN 侧在注入完 blob 数据后调用
  </script>
</body>
</html>
`;

type CameraState = 'idle' | 'loading' | 'ready' | 'error';

export default function CameraView({ onPoseDetected, isActive, throttleMs = 100 }: CameraViewProps) {
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [loadingDetail, setLoadingDetail] = useState<string>('准备中...');
  const webViewRef = useRef<WebView>(null);
  const isMountedRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraStateRef = useRef<CameraState>('idle');
  const injectionDoneRef = useRef(false);

  useEffect(() => { cameraStateRef.current = cameraState; }, [cameraState]);

  const startTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        console.warn('[CameraView] Initialization timeout (120s)');
        setErrorMessage('初始化超时，请检查网络连接后重试。可能原因：CDN 被墙或网络不稳定。');
        setCameraState('error');
      }
    }, 120000);
  }, []);

  // ── 注入本地缓存的 MediaPipe 文件到 WebView ──
  const injectLocalFiles = useCallback(async () => {
    const webView = webViewRef.current;
    if (!webView) return;

    try {
      const files = mediaPipeAssetService.getFiles();

      // 注入 blob URL（先注入所有资源文件，再注入 pose.js）
      for (const filename of files) {
        if (filename === 'pose.js') continue; // pose.js 最后注入

        try {
          const base64 = await mediaPipeAssetService.getFileBase64(filename);
          const mimeType = mediaPipeAssetService.getMimeType(filename);

          // 分块注入大文件（避免 injectJavaScript 超长字符串问题）
          // 每次注入一个文件
          webView.injectJavaScript(
            'window.__registerBlob("' + filename + '","' + base64 + '","' + mimeType + '");'
          );
        } catch (err) {
          console.warn(`[CameraView] Failed to inject ${filename}:`, err);
        }
      }

      // 注入 pose.js（通过 eval 执行）
      try {
        const poseJsBase64 = await mediaPipeAssetService.getFileBase64('pose.js');
        webView.injectJavaScript(
          'window.__evalPoseJs("' + poseJsBase64 + '");'
        );
      } catch (err) {
        console.warn('[CameraView] Failed to inject pose.js:', err);
      }

      // 通知 WebView 开始初始化
      webView.injectJavaScript('init();');
      injectionDoneRef.current = true;
    } catch (err) {
      console.warn('[CameraView] Local injection failed, falling back to CDN:', err);
      // 本地注入失败 → 回退到 CDN 加载
      webView.injectJavaScript('init();');
      injectionDoneRef.current = true;
    }
  }, []);

  // 组件挂载时：请求权限 → 准备缓存 → 显示 WebView
  useEffect(() => {
    isMountedRef.current = true;

    async function requestPermissionAndStart() {
      if (Platform.OS === 'android') {
        try {
          const { status } = await Camera.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            if (isMountedRef.current) {
              setErrorMessage('相机权限被拒绝，请在设置中授予权限');
              setCameraState('error');
            }
            return;
          }
        } catch (err) {
          console.warn('[CameraView] Permission request error:', err);
        }
      }

      if (!isMountedRef.current) return;

      // 确保本地缓存可用
      setCameraState('loading');
      setLoadingDetail('准备 AI 模型...');
      startTimeout();

      try {
        await mediaPipeAssetService.ensureCached((message) => {
          if (isMountedRef.current) {
            setLoadingDetail(message);
          }
        });
      } catch (err) {
        console.warn('[CameraView] Cache preparation failed:', err);
        // 缓存准备失败 → 仍然显示 WebView（会回退到 CDN）
        if (isMountedRef.current) {
          setLoadingDetail('本地缓存失败，尝试在线加载...');
        }
      }
    }

    requestPermissionAndStart();

    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [startTimeout]);

  // 同步 isActive 到 WebView
  useEffect(() => {
    if (webViewRef.current && cameraState === 'ready') {
      webViewRef.current.injectJavaScript(
        'window.postMessage(JSON.stringify({type:"setActive",active:' + (isActive ? 'true' : 'false') + '}), "*");'
      );
    }
  }, [isActive, cameraState]);

  // WebView 加载完成后注入本地文件
  const handleLoadEnd = useCallback(() => {
    if (injectionDoneRef.current) return; // 避免重复注入

    // 先发送控制参数
    webViewRef.current?.injectJavaScript(
      'window.postMessage(JSON.stringify({type:"setThrottle",interval:' + throttleMs + '}), "*");' +
      'window.postMessage(JSON.stringify({type:"setActive",active:' + (isActive ? 'true' : 'false') + '}), "*");'
    );

    // 注入本地缓存的 MediaPipe 文件
    injectLocalFiles();
  }, [throttleMs, isActive, injectLocalFiles]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      switch (message.type) {
        case 'pose':
          if (message.data) {
            onPoseDetected(message.data);
          }
          break;
        case 'ready':
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          if (isMountedRef.current) setCameraState('ready');
          break;
        case 'error':
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          console.warn('[CameraView] MediaPipe error:', message.data);
          if (isMountedRef.current) {
            setErrorMessage(String(message.data || '未知错误'));
            setCameraState('error');
          }
          break;
        case 'cdnStatus':
          if (isMountedRef.current && cameraStateRef.current === 'loading') {
            setLoadingDetail(String(message.data || ''));
          }
          break;
        case 'log':
          console.log('[CameraView]', message.data);
          break;
      }
    } catch (err) {
      // 忽略非 JSON 消息
    }
  }, [onPoseDetected]);

  const handleOpenSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  const handleReload = () => {
    setErrorMessage('');
    setLoadingDetail('重新加载中...');
    setCameraState('loading');
    injectionDoneRef.current = false;
    startTimeout();
    webViewRef.current?.reload();
  };

  const canShowWebView = cameraState !== 'idle';

  return (
    <View style={styles.container}>
      {canShowWebView && (
        <WebView
          ref={webViewRef}
          source={{ html: MEDIAPIPE_HTML, baseUrl: 'https://localhost' }}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          startInLoadingState={false}
          onMessage={handleMessage}
          onLoadEnd={handleLoadEnd}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          sharedCookiesEnabled={false}
          originWhitelist={['*']}
          cacheEnabled={true}
          androidLayerType="hardware"
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
      )}

      {cameraState === 'loading' && (
        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.loadingTitle}>正在初始化相机</Text>
          <Text style={styles.loadingSub}>{loadingDetail}</Text>
          <Text style={styles.loadingHint}>首次使用需下载 AI 模型，请耐心等待...</Text>
        </View>
      )}

      {cameraState === 'error' && (
        <View style={styles.overlay}>
          <Text style={styles.errorTitle}>无法启动相机</Text>
          <ScrollView style={styles.errorScroll} contentContainerStyle={styles.errorScrollContent}>
            <Text style={styles.errorDetail}>{errorMessage || '请确认已授予相机权限'}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.settingsButton} onPress={handleOpenSettings}>
            <Text style={styles.settingsButtonText}>打开设置</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.retryButton} onPress={handleReload}>
            <Text style={styles.retryButtonText}>重试</Text>
          </TouchableOpacity>
        </View>
      )}

      {cameraState === 'ready' && !isActive && (
        <View style={[styles.overlay, styles.idleOverlay]} pointerEvents="none">
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
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
    marginBottom: 6,
  },
  loadingHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
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
  errorScroll: {
    maxHeight: 80,
    marginBottom: 16,
  },
  errorScrollContent: {
    paddingHorizontal: 24,
  },
  errorDetail: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
