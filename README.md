<div align="center">

# 🏋️ AI Sport

**AI-Powered Fitness Tracking App** | **AI 驱动的健身追踪应用**

[![Expo](https://img.shields.io/badge/Expo-55-black?logo=expo)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React_Native-0.83-61DAFB?logo=react)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Pose-4285F4?logo=google)](https://google.github.io/mediapipe/)
[![Tests](https://img.shields.io/badge/Tests-82%20passing-brightgreen)](./src/__tests__/)

[English](#-english) · [中文](#-中文)

</div>

---

## 🇬🇧 English

AI Sport is a **mobile fitness tracking app** that uses **MediaPipe Pose** to detect and count exercises in real-time through your phone's camera — no wearables needed. Just face the camera and start working out.

### ✨ Key Features

- **6 Exercise Types**: Sit-ups, Squats, Jump Rope, Jumping Jacks, Standing Long Jump, Vertical Jump
- **Real-time Pose Detection**: MediaPipe Pose runs entirely on-device via WebView — no server, no latency
- **Dual Training Modes**: Count mode (target reps) and Timed mode (target duration)
- **Live Form Feedback**: Real-time posture correction — "back straight", "knees past toes", "hips off the mat"
- **Smart Counting Algorithms**: State machine + Kalman filter + adaptive calibration for each exercise
- **Measurement**: Standing long jump distance (cm) and vertical jump height (cm) via body-proportion calibration
- **Offline-first**: MediaPipe model files cached locally after first download — zero network dependency
- **Workout History**: Local persistence with analytics (total reps, duration, averages)
- **Sound Effects**: Local audio feedback for rep counting

### 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                    Screens                       │
│  HomeScreen · WorkoutScreen · HistoryScreen      │
│  AnalyticsScreen · ProfileScreen · LoginScreen   │
├─────────────────────────────────────────────────┤
│                    Hooks                         │
│  useWorkout · useExerciseFeedback · useSound     │
├─────────────────────────────────────────────────┤
│                   Services                       │
│  ExerciseCounter ── 6 Subclasses                 │
│  MediaPipeAssetService · PoseDetectionService    │
│  StorageService · AuthService                    │
├─────────────────────────────────────────────────┤
│                    Utils                         │
│  KalmanFilter1D · SlidingWindow · PeakDetector   │
└─────────────────────────────────────────────────┘
         ↕ postMessage
┌─────────────────────────────────────────────────┐
│              CameraView (WebView)                │
│  MediaPipe Pose · getUserMedia · Canvas Overlay  │
│  blob: URL injection from local cache            │
└─────────────────────────────────────────────────┘
```

### 🧠 Algorithm Highlights

Each exercise counter implements a **finite state machine** with:

| Feature | Implementation |
|---------|---------------|
| Signal smoothing | 1D Kalman filter per keypoint signal |
| Adaptive thresholds | Auto-calibrated from user's body proportions (shoulder width, hip width, torso length) |
| Debounce | N-frame confirmation before state transition |
| Foul detection | Back lean, shallow squat, hip lift, knee valgus |
| Pixel→cm conversion | Body proportion calibration (torso ≈ height × 29%) |

| Exercise | Algorithm | State Machine |
|----------|-----------|---------------|
| Sit-ups | Shoulder-Hip-Knee trunk angle | idle → lying → rising → up → returning → done |
| Squats | Knee angle + back angle fusion | idle → standing → descending → bottom → ascending |
| Jumping Jacks | Arm angle + leg spread ratio | idle → closed → opening → open → closing |
| Jump Rope | Wrist rotation cycle + hip bounce | idle → detecting → jumping → resting |
| Standing Long Jump | Knee angle + ankle X displacement | idle → ready → crouch → takeoff → airborne → landing → stable |
| Vertical Jump | Knee angle + ankle/hip Y rise | idle → ready → crouch → takeoff → airborne → landing → stable |

### 📱 Supported Platforms

- **Android** (primary target, APK via EAS Build)
- **iOS** (Expo managed workflow)
- **Desktop** — separate [Tauri project](https://github.com/gakiwoo/ai-sport-desktop) (React + TypeScript + Vite)

### 🚀 Getting Started

#### Prerequisites

- Node.js ≥ 18
- Expo CLI (`npm install -g expo-cli`)
- Android Studio / Xcode for device testing

#### Installation

```bash
# Clone the repository
git clone https://github.com/gakiwoo1006/ai-motion-tracker.git
cd ai-motion-tracker

# Install dependencies
npm install

# Start development server
npx expo start
```

#### Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run android` | Run on Android device/emulator |
| `npm run ios` | Run on iOS simulator |
| `npm test` | Run unit tests (Jest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint with ESLint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Format with Prettier |

### 🧪 Testing

82 unit tests across 8 test suites, covering all exercise counters and signal processing utilities:

```bash
npm test
```

Test fixtures use **pixel-coordinate** Pose objects (matching CameraView's `(1-lm.x)*W, lm.y*H` output) with pre-built pose presets (standing, lying, squatting, airborne, etc.).

### 📂 Project Structure

```
src/
├── components/
│   ├── CameraView.tsx          # WebView + MediaPipe Pose + Camera
│   ├── BarChart.tsx            # Workout analytics chart
│   ├── SkeletonOverlay.tsx     # Pose skeleton rendering
│   └── ExerciseIllustration.tsx # Exercise guide illustrations
├── constants/
│   └── exerciseConfig.ts       # Exercise names, targets, defaults
├── contexts/
│   └── AuthContext.tsx          # Authentication context
├── hooks/
│   ├── useWorkout.ts           # Training session lifecycle
│   ├── useExerciseFeedback.ts  # Real-time form correction
│   └── useSound.ts             # Audio feedback
├── screens/
│   ├── HomeScreen.tsx          # Exercise selection
│   ├── WorkoutScreen.tsx       # Active training session
│   ├── HistoryScreen.tsx       # Workout history
│   ├── AnalyticsScreen.tsx     # Statistics dashboard
│   ├── ProfileScreen.tsx       # User profile
│   └── LoginScreen.tsx         # Authentication
├── services/
│   ├── ExerciseCounter.ts      # Base class for all counters
│   ├── MediaPipeAssetService.ts # Local cache + blob: URL injection
│   ├── PoseDetectionService.ts  # Angle & distance calculations
│   ├── StorageService.ts       # AsyncStorage persistence
│   ├── AuthService.ts          # Cookie-based auth (gakiwoo.com)
│   └── counters/
│       ├── SitUpCounter.ts
│       ├── SquatsCounter.ts
│       ├── JumpingJacksCounter.ts
│       ├── JumpRopeCounter.ts
│       ├── StandingLongJumpCounter.ts
│       └── VerticalJumpCounter.ts
├── types/
│   ├── index.ts                # Core types (Pose, Keypoint, WorkoutSession)
│   ├── auth.ts                 # Auth types
│   └── navigation.ts           # Navigation types
├── utils/
│   └── filters.ts              # KalmanFilter1D, SlidingWindow
└── __tests__/                  # 82 unit tests
```

### 🔧 MediaPipe Offline Cache

For users in China where public CDNs (jsdelivr, unpkg, npmmirror) are unreliable, AI Sport implements a **3-tier asset loading strategy**:

1. **Local cache** (`documentDirectory/mediapipe/`) — checked first, zero network needed
2. **Self-hosted CDN** (gakiwoo.com) — primary download source
3. **Public CDNs** (npmmirror → jsdelivr → unpkg) — fallback chain

Downloaded files are injected into the WebView as **blob: URLs**, which are same-origin with `https://localhost` — the only way to load local data in a secure context required by `getUserMedia`.

### 🗺️ Roadmap

- [ ] Cloud sync for workout records ([design doc](./docs/cloud-sync-design.md))
- [ ] Apple Watch / Wear OS companion
- [ ] Exercise plan & reminder system
- [ ] Social features (leaderboard, challenges)
- [ ] More exercise types (push-ups, pull-ups, planks)

### 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

### 📄 License

This project is proprietary software. All rights reserved.

---

## 🇨🇳 中文

AI Sport 是一款基于 **MediaPipe Pose** 的 **手机健身追踪应用**，通过手机摄像头实时检测和计数运动动作——无需穿戴设备，对准摄像头即可开始训练。

### ✨ 核心特性

- **6 种运动**：仰卧起坐、深蹲、跳绳、开合跳、立定跳远、纵跳摸高
- **实时姿态检测**：MediaPipe Pose 完全在设备端运行（WebView），零延迟、无需服务器
- **双训练模式**：定数模式（目标次数）和定时模式（目标时长）
- **实时动作反馈**：姿态纠正——"背部挺直"、"膝盖不要超过脚尖"、"臀部不要离垫"
- **智能计数算法**：状态机 + 卡尔曼滤波 + 自适应标定，每种运动独立优化
- **距离/高度测量**：立定跳远距离(cm)和纵跳摸高高度(cm)，基于身体比例自动标定
- **离线优先**：MediaPipe 模型文件首次下载后永久缓存，零网络依赖
- **训练历史**：本地持久化存储 + 统计分析（总次数、总时长、平均值）
- **音效反馈**：本地音频文件，计数时播放提示音

### 🏗️ 架构

```
┌─────────────────────────────────────────────────┐
│                    界面层                        │
│  首页 · 训练页 · 历史页 · 统计页 · 个人页 · 登录  │
├─────────────────────────────────────────────────┤
│                    Hooks 层                      │
│  useWorkout · useExerciseFeedback · useSound     │
├─────────────────────────────────────────────────┤
│                    服务层                        │
│  ExerciseCounter ── 6 个子类                     │
│  MediaPipeAssetService · PoseDetectionService    │
│  StorageService · AuthService                    │
├─────────────────────────────────────────────────┤
│                    工具层                        │
│  KalmanFilter1D · SlidingWindow · PeakDetector   │
└─────────────────────────────────────────────────┘
         ↕ postMessage
┌─────────────────────────────────────────────────┐
│              CameraView (WebView)                │
│  MediaPipe Pose · getUserMedia · Canvas 骨骼绘制  │
│  blob: URL 注入本地缓存文件                       │
└─────────────────────────────────────────────────┘
```

### 🧠 算法亮点

每个运动计数器实现了**有限状态机**，核心机制：

| 特性 | 实现方式 |
|------|----------|
| 信号平滑 | 每个关键点信号独立 1D 卡尔曼滤波 |
| 自适应阈值 | 根据用户身体比例自动标定（肩宽、髋宽、躯干长度） |
| 防抖 | 状态切换需连续 N 帧确认 |
| 犯规检测 | 弓背、蹲深不够、臀部离垫、膝盖内扣 |
| 像素→厘米换算 | 身体比例标定（躯干 ≈ 身高 × 29%） |

| 运动 | 算法核心 | 状态机 |
|------|---------|--------|
| 仰卧起坐 | 肩-髋-膝躯干角度 | idle → lying → rising → up → returning → done |
| 深蹲 | 膝盖角度 + 背部角度融合 | idle → standing → descending → bottom → ascending |
| 开合跳 | 手臂角度 + 腿部张开比例 | idle → closed → opening → open → closing |
| 跳绳 | 手腕旋转周期 + 髋部弹跳 | idle → detecting → jumping → resting |
| 立定跳远 | 膝盖角度 + 脚踝水平位移 | idle → ready → crouch → takeoff → airborne → landing → stable |
| 纵跳摸高 | 膝盖角度 + 脚踝/髋部上升 | idle → ready → crouch → takeoff → airborne → landing → stable |

### 📱 支持平台

- **Android**（主要目标，通过 EAS Build 构建 APK）
- **iOS**（Expo 托管工作流）
- **桌面端** — 独立的 [Tauri 项目](https://github.com/gakiwoo/ai-sport-desktop)（React + TypeScript + Vite）

### 🚀 快速开始

#### 前置条件

- Node.js ≥ 18
- Expo CLI (`npm install -g expo-cli`)
- Android Studio / Xcode 用于真机调试

#### 安装

```bash
# 克隆仓库
git clone https://github.com/gakiwoo1006/ai-motion-tracker.git
cd ai-motion-tracker

# 安装依赖
npm install

# 启动开发服务器
npx expo start
```

#### 可用命令

| 命令 | 说明 |
|------|------|
| `npm start` | 启动 Expo 开发服务器 |
| `npm run android` | 在 Android 设备/模拟器运行 |
| `npm run ios` | 在 iOS 模拟器运行 |
| `npm test` | 运行单元测试 (Jest) |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run lint` | ESLint 检查 |
| `npm run lint:fix` | 自动修复 lint 问题 |
| `npm run format` | Prettier 格式化 |

### 🧪 测试

8 个测试套件共 82 个单元测试，覆盖所有运动计数器和信号处理工具：

```bash
npm test
```

测试用例使用**像素坐标** Pose 对象（与 CameraView 的 `(1-lm.x)*W, lm.y*H` 输出一致），内置预设姿态（站立、仰卧、深蹲、腾空等）。

### 📂 项目结构

```
src/
├── components/               # UI 组件
│   ├── CameraView.tsx        # WebView + MediaPipe Pose + 摄像头
│   ├── BarChart.tsx          # 训练统计图表
│   ├── SkeletonOverlay.tsx   # 骨骼叠加层
│   └── ExerciseIllustration.tsx # 运动图示
├── constants/
│   └── exerciseConfig.ts     # 运动名称、默认目标、配色
├── contexts/
│   └── AuthContext.tsx       # 认证上下文
├── hooks/
│   ├── useWorkout.ts         # 训练会话生命周期管理
│   ├── useExerciseFeedback.ts # 实时动作反馈
│   └── useSound.ts           # 音效播放
├── screens/                  # 页面
│   ├── HomeScreen.tsx        # 运动选择首页
│   ├── WorkoutScreen.tsx     # 训练主界面
│   ├── HistoryScreen.tsx     # 训练历史
│   ├── AnalyticsScreen.tsx   # 统计仪表盘
│   ├── ProfileScreen.tsx     # 个人中心
│   └── LoginScreen.tsx       # 登录
├── services/                 # 业务逻辑
│   ├── ExerciseCounter.ts    # 计数器基类
│   ├── MediaPipeAssetService.ts # 本地缓存 + blob: URL 注入
│   ├── PoseDetectionService.ts  # 角度 & 距离计算
│   ├── StorageService.ts     # AsyncStorage 持久化
│   ├── AuthService.ts        # Cookie 认证 (gakiwoo.com)
│   └── counters/             # 6 个运动计数器子类
├── types/                    # 类型定义
├── utils/
│   └── filters.ts            # KalmanFilter1D、SlidingWindow
└── __tests__/                # 82 个单元测试
```

### 🔧 MediaPipe 离线缓存

针对国内公共 CDN（jsdelivr、unpkg、npmmirror）不稳定的问题，AI Sport 实现了**三级资源加载策略**：

1. **本地缓存** (`documentDirectory/mediapipe/`) — 优先检查，零网络依赖
2. **自有 CDN** (gakiwoo.com) — 首选下载源
3. **公共 CDN**（npmmirror → jsdelivr → unpkg）— 回退链

下载的文件以 **blob: URL** 注入 WebView，与 `https://localhost` 同源——这是在 `getUserMedia` 要求的安全上下文中加载本地数据的唯一方式。

### 🗺️ 路线图

- [ ] 训练记录云端同步（[设计方案](./docs/cloud-sync-design.md)）
- [ ] Apple Watch / Wear OS 配套应用
- [ ] 运动计划 & 提醒系统
- [ ] 社交功能（排行榜、挑战赛）
- [ ] 更多运动类型（俯卧撑、引体向上、平板支撑）

### 🤝 贡献

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feat/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feat/amazing-feature`)
5. 发起 Pull Request

### 📄 许可证

本项目为专有软件，保留所有权利。
