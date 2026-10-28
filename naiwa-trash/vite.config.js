import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({
  base: './', clearScreen: false,
  server: {port: 1420, strictPort: true, watch: {ignored: ['**/src-tauri/**']}},
  build: {rollupOptions: {input: {pet: resolve('index.html'), settings: resolve('settings.html')}}},
});
