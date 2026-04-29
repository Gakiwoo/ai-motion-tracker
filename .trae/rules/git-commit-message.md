---
alwaysApply: true
scene: git_message
---

在此处编写规则，自定义 AI 生成提交信息的风格。
1. 项目框架版本及依赖
核心框架：

Expo: ~55.0.17
React: 19.2.0
React Native: 0.83.6
React DOM: 19.2.0
关键依赖：

@react-navigation/native: ^6.1.18
@react-navigation/stack: ^6.4.1
react-native-screens: ~4.23.0
react-native-gesture-handler: ~2.30.0
react-native-svg: 15.15.3
expo-camera: ~55.0.16
expo-av: ~16.0.0
开发工具：

TypeScript: ^5.5.0
ESLint: ^10.2.1
Prettier: ^3.8.3
2. 测试框架详细要求
测试框架：

Jest: ^30.3.0
ts-jest: ^29.4.9
@types/jest: ^30.0.0
Jest 配置 (jest.config.js)：


preset: 'ts-jest'
testEnvironment: 'node'
roots: ['<rootDir>/src']
testMatch: ['**/__tests__/**/*.test.ts']
moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json']
测试文件需放在 src/__tests__/ 目录下，命名格式为 *.test.ts

3. 禁止使用的 API / 规则
ESLint 规则：

@typescript-eslint/no-explicit-any: 关闭 (允许使用 any)
@typescript-eslint/ban-ts-comment: 关闭 (允许使用 @ts-ignore 等注释)
no-console: 警告，仅 warn 和 error 允许
no-unused-vars: 关闭，使用 TS 版本 @typescript-eslint/no-unused-vars (warn 级别，参数以 _ 开头除外)
忽略目录：

node_modules/、.expo/、dist/、mediapipe-staging/、mediapipe-upload/
