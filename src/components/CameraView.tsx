import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Pose } from '../types';

interface CameraViewProps {
  onPoseDetected: (pose: Pose) => void;
  isActive: boolean;
  /** 发送帧率间隔（ms），默认 100。跳绳建议 80，深蹲/仰卧起坐建议 120 */
  throttleMs?: number;
}

const MEDIAPIPE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalatable=no">
  <script src="https://registry.npmmirror.com/@mediapipe/camera_utils/files/camera_utils.js" crossorigin="anonymous"></script>
  <script src="https://registry.npmmirror.com/@mediapipe/control_utils/files/control_utils.js" crossorigin="anonymous"></script>
  <script src="https://registry.npmmirror.com/@mediapipe/drawing_utils/files/drawing_utils.js" crossorigin="anonymous"></script>
  <script src="https://registry.npmmirror.com/@mediapipe/pose/files/pose.js" crossorigin="anonymous"></script>
  <style>
    * { margin: 0; padding: 0; }
    body { background: #000; overflow: hidden; }
    #video { display: none; }
    #canvas { width: 100vw; height: 100vh; }
    #error { display: none; color: #fff; text-align: center; padding: 20px; }
  </style>
</head>
<body>
  <video id="video" playsinline autoPlay></video>
  <canvas id="canvas"></canvas>
  <div id="error"></div>
  <script>
    const videoElement = document.getElementById('video');
    const canvasElement = document.getElementById('canvas');
    const canvasCtx = canvasElement.getContext('2d');
    const errorElement = document.getElementById('error');

    const KEYPOINT_NAMES = [
      'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
      'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
      'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
      'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
    ];

    let pose = null;
    let camera = null;
    let lastPoseData = null;

    function showError(msg) {
      errorElement.style.display = 'block';
      errorElement.textContent = msg;
    }

    function onResults(results) {
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasCtx.save();
      canvasCtx.scale(-1, 1);
      canvasCtx.translate(-canvasElement.width, 0);

      if (results.poseLandmarks) {
        drawingUtils.drawSkeleton(results.poseLandmarks, canvasCtx);
        drawingUtils.drawPose(results.poseLandmarks, canvasCtx);

        const keypoints = results.poseLandmarks.map((lm, idx) => ({
          x: (1 - lm.x) * canvasElement.width,
          y: lm.y * canvasElement.height,
          score: lm.visibility,
          name: KEYPOINT_NAMES[idx]
        }));

        lastPoseData = { keypoints, score: 0.9 };
      } else {
        lastPoseData = null;
      }
      canvasCtx.restore();
    }

    async function initMediaPipe() {
      try {
        pose = new Pose({
          locateFile: (file) => 'https://registry.npmmirror.com/@mediapipe/pose/files/' + file
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        pose.onResults(onResults);

        camera = new Camera(videoElement, {
          onFrame: async () => {
            await pose.send({ image: videoElement });
          },
          width: 480,
          height: 360
        });

        await camera.start();
      } catch (err) {
        showError('相机权限被拒绝或不可用\\n请在浏览器设置中允许访问相机');
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          data: 'Camera access denied'
        }));
      }
    }

    // 帧率控制：默认 100ms（≈10fps），可通过消息动态调整
    let sendInterval = 100;
    let lastSendTime = 0;

    // 监听来自 RN 的帧率配置消息
    window.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'setThrottle' && typeof msg.interval === 'number') {
          sendInterval = Math.max(50, Math.min(300, msg.interval));
        }
      } catch (e) {}
    });

    setInterval(() => {
      const now = Date.now();
      if (lastPoseData && now - lastSendTime >= sendInterval) {
        lastSendTime = now;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'pose',
          data: lastPoseData
        }));
      }
    }, 50);

    initMediaPipe();
  </script>
</body>
</html>
`;

type CameraState = 'loading' | 'active' | 'error';

export default function CameraView({ onPoseDetected, isActive, throttleMs = 100 }: CameraViewProps) {
  const [cameraState, setCameraState] = useState<CameraState>('loading');
  const webViewRef = React.useRef<WebView>(null);

  // isActive 切换时重置状态
  useEffect(() => {
    if (isActive) {
      setCameraState('loading');
    }
  }, [isActive]);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'pose' && message.data) {
        onPoseDetected(message.data);
      } else if (message.type === 'error') {
        setCameraState('error');
      }
    } catch (err) {
      console.error('Error parsing pose data:', err);
    }
  }, [onPoseDetected]);

  const handleOpenSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  if (!isActive) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      {cameraState === 'loading' && (
        <View style={styles.overlay}>
          <Text style={styles.loadingText}>正在初始化相机...</Text>
          <Text style={styles.hintText}>请确保允许访问相机</Text>
        </View>
      )}
      {cameraState === 'error' && (
        <View style={styles.overlay}>
          <Text style={styles.errorTitle}>无法访问相机</Text>
          <Text style={styles.errorText}>请在设置中允许访问相机</Text>
          <TouchableOpacity style={styles.settingsButton} onPress={handleOpenSettings}>
            <Text style={styles.settingsButtonText}>打开设置</Text>
          </TouchableOpacity>
        </View>
      )}
      <WebView
        key={isActive ? 'camera-active' : 'camera-inactive'}
        ref={webViewRef}
        source={{ html: MEDIAPIPE_HTML }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        onMessage={handleMessage}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        onLoadEnd={() => {
          webViewRef.current?.injectJavaScript(
            `window.postMessage(JSON.stringify({type:'setThrottle',interval:${throttleMs}}), '*');`
          );
          setCameraState('active');
        }}
        onError={() => setCameraState('error')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    zIndex: 1,
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 10,
  },
  hintText: {
    color: '#aaa',
    fontSize: 14,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorText: {
    color: '#aaa',
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  settingsButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 8,
  },
  settingsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  webview: {
    flex: 1,
  },
});
