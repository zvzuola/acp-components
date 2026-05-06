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
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
});
