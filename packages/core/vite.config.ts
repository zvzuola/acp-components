import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => format === 'es' ? 'index.mjs' : 'index.cjs',
    },
    rollupOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        'zustand',
        '@agentclientprotocol/sdk',
      ],
      output: {
        globals: {
          react: 'React',
          zustand: 'Zustand',
        },
      },
    },
  },
});
