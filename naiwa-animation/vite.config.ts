import {defineConfig} from 'vite';
import {createRequire} from 'node:module';

// Motion Canvas's server plugins expose CommonJS default exports.
const require = createRequire(import.meta.url);
const motionCanvas = require('@motion-canvas/vite-plugin').default;
const ffmpeg = require('@motion-canvas/ffmpeg').default;

export default defineConfig({
  // The exporter is injected by ?project and is invisible to entry-file scans.
  // Declare browser runtime entry points before a production render begins.
  optimizeDeps: {
    noDiscovery: true,
    include: [
      '@motion-canvas/core', '@motion-canvas/2d', 'three',
      '@motion-canvas/2d/lib/jsx-dev-runtime',
      '@motion-canvas/2d/lib/jsx-runtime',
      '@motion-canvas/core/lib/tweening/timingFunctions',
      '@motion-canvas/ffmpeg/lib/client',
    ],
  },
  plugins: [
    motionCanvas({
      project: ['./src/project.ts', './episodes/*/project.ts'],
      output: './output',
    }),
    ffmpeg(),
  ],
  server: {
    host: '127.0.0.1',
    fs: {
      strict: true,
      deny: [
        '.env', '.env.*', '**/.git/**', '**/private/**',
        '**/generated/**', '**/*credentials*', '**/scripts/**',
      ],
    },
  },
});
