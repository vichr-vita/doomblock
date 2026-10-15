import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// A test-only browser host for the real UI and content controller. Never packaged.
export default defineConfig({
  plugins: [tailwindcss()],
  server: { port: 4173, strictPort: true },
});
