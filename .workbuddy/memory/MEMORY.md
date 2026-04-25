# AI Sport 项目长期记忆

## 项目概况
- **技术栈**: Expo 55 + React Native 0.73 + TypeScript + MediaPipe Pose (WebView CDN)
- **产品**: 健身追踪 App，6 种运动（仰卧起坐/立定跳远/原地纵跳/跳绳/开合跳/深蹲）
- **桌面版**: `ai-sport-desktop` 独立项目（HTML/CSS/JS）

## 架构关键信息
- `src/services/counters/` — 6 个运动计数器（均继承 `ExerciseCounter`）
- `src/utils/filters.ts` — 共享信号处理工具（KalmanFilter1D + SlidingWindow）
- `src/components/CameraView.tsx` — MediaPipe WebView 封装，帧率默认 100ms，支持 `throttleMs` prop
- `src/hooks/useExerciseFeedback.ts` — 基于 Pose 原始数据的姿态反馈（与 Counter.getFeedback 互补）
- `src/hooks/useWorkout.ts` — 训练流程管理 hook，创建 Counter 实例

## 算法状态（2026-04-24 更新）
- 仰卧起坐 V3 ✅ （lying→rising 3帧确认 + done帧计数器替代setTimeout + 犯规检测）
- 立定跳远 V3 ✅ （baselineWindow外部基线 + 动态基线更新）
- 原地纵跳 V3 ✅ （90帧baselineWindow + externalBaseline + minHeight 0.025）
- 跳绳 V2.1 ✅ （四状态机+自适应身体比例阈值+迟滞防抖+二跳识别）
- 深蹲 V2.1 ✅ （多信号融合评分+峰值配对+动态校准+姿态反馈）
- 开合跳 V2.1 ✅ （三信号融合评分+展开收拢配对+稳定校准）
- PeakDetector：支持 externalBaseline 可选参数（跳跃类计数器使用）

## 双模式功能（2026-04-24）
- WorkoutMode = 'count' | 'timed'，两端（RN + Tauri）同步实现
- 定时模式：200ms 轮询检测时间到期 → timeUp → 自动保存
- 定数模式保持不变：达标 Alert → 继续/停止
- StorageService 向后兼容：旧记录无 mode 字段自动补 'count'
- DEFAULT_DURATIONS：jumping_jacks/squats/sit_ups/jump_rope=60s, standing_long_jump/vertical_jump=30s

## 架构关键信息（2026-04-23 更新）
- `ExerciseCounter` 基类: `totalFrames` + `frameIntervalMs`(100ms) + 通用 `getRate()`
- 子类不再各自声明 `totalFrames`，统一使用基类字段

## 认证架构（2026-04-24）
- 后端：gakiwoo.com/api/auth，Cookie 双 Token（access 15min + refresh 7d httpOnly）
- 手机端：Set-Cookie header 手动提取，存 AsyncStorage，Authorization: Bearer header 发送
- 桌面端：credentials:'include'，浏览器自动管理 Cookie
- 401 → 自动 refresh，失败 → 跳登录页

## 桌面端项目
- 位置：`e:\BaiduSyncdisk\Gakiwu\00-Vibeo Coding\ai-sport-desktop\`
- 技术栈：Tauri 2 + React + TypeScript + Vite + MediaPipe Pose CDN
- 前端入口：`src/main.tsx` → `src/App.tsx`（HashRouter），Vite 构建产物在 `dist/`
- CSP 已包含 gakiwoo.com，MediaPipe CDN，mediastream 摄像头流
- 图标：`src-tauri/icons/`（icon_32x32.png / icon_128x128.png / 128x128@2x.png / icon_256x256.png / icon.ico）
- 旧版 HTML/JS（index.html + js/ + css/）已于 2026-04-24 清理
- 数据存储：localStorage（StorageService），待迁移到 tauri-plugin-store
- Windows subsystem：`#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` 已配置 ✅
- 全局常量：`src/constants/exerciseConfig.ts` 导出 EXERCISE_CONFIGS / NAMES / DEFAULT_TARGETS / COLORS / CARD_THEMES / KEYPOINT_NAMES
- 深色模式：CSS 变量（global.css `:root` + `@media (prefers-color-scheme: dark)`），图表用 JS 动态检测
- ErrorBoundary 已包裹 App 根组件 ✅

## 用户偏好
- 沟通用中文，注重效率
- 偏好精准代码修复而非大规模重构
- 对接 Claude Code (claude-sonnet-4-6) 通过第三方代理
