const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  // 基础 JS 推荐
  js.configs.recommended,

  // Prettier 兼容（关闭与 Prettier 冲突的规则）
  prettierConfig,

  // TypeScript 文件配置
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      // TypeScript 规则
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',

      // Prettier 集成
      'prettier/prettier': 'warn',

      // 通用规则
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': 'off', // 用 TS 版本代替
    },
  },

  // 忽略目录
  {
    ignores: [
      'node_modules/',
      '.expo/',
      'dist/',
      'mediapipe-staging/',
      'mediapipe-upload/',
    ],
  },
];
