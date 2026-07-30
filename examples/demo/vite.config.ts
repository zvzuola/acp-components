import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  base: process.env.GITHUB_ACTIONS ? '/acp-components/' : '/',
  resolve: {
    alias: {
      '@acp-components/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@acp-components/react': resolve(__dirname, '../../packages/react/src/index.ts'),
    },
  },
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: true,
      },
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['monaco-editor'],
  },
});
