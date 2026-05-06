import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@acp-components/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@acp-components/react': resolve(__dirname, '../../packages/react/src/index.ts'),
    },
  },
  // In Tauri, the dev server is accessed via the webview with a distinct host.
  // These settings ensure Vite works correctly in that context.
  server: {
    port: 5174,
    strictPort: true,
  },
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  build: {
    outDir: 'dist',
  },
});
