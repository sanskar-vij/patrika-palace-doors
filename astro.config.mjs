import { defineConfig } from 'astro/config';
import { sync } from './scripts/sync.mjs';
sync();
export default defineConfig({
  output: 'static',
  server: { host: true, port: 4174 },
  devToolbar: { enabled: false },
  integrations: [{
    name: 'patrika-content-sync',
    hooks: {
      'astro:build:start': () => sync(),
      'astro:server:setup': ({ server }) => {
        server.watcher.on('change', (file) => {
          const normalized = file.replaceAll('\\', '/');
          if (normalized.endsWith('/src/data/content.ts') || normalized.includes('/src/scripts/')) {
            try { sync(); server.ws.send({ type: 'full-reload' }); }
            catch (error) { console.error('Content update failed:', error.message); }
          }
        });
      }
    }
  }]
});
