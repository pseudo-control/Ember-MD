import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import solid from 'eslint-plugin-solid/configs/typescript';

export default [
  // Global ignores
  {
    ignores: [
      'dist-webpack/',
      'dist/',
      'electron-dist/',
      'bundle-mac/',
      'node_modules/',
      'deps/',
      '*.config.js',
      '*.config.ts',
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript recommended
  ...tseslint.configs.recommended,

  // SolidJS
  {
    files: ['**/*.{ts,tsx}'],
    ...solid,
  },

  // Project-wide rules
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Code quality
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'off',

      // TypeScript - gradual adoption
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-require-imports': 'off',

      // Block React imports (this is a SolidJS project)
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react-dom', 'react-*'], message: 'This is a SolidJS project — do not import React.' },
        ],
      }],
    },
  },

  // Electron main process (CommonJS)
  {
    files: ['electron/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
