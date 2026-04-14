import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://yourdomain.com',
  integrations: [tailwind()],
  build: {
    format: 'directory'
  },
  server: {
    port: 3000
  }
});
