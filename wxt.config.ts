import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Doomblock',
    description:
      'Filter manipulative YouTube recommendations. Keep serious information.',
    permissions: ['storage'],
    host_permissions: [
      'https://www.youtube.com/*',
      'https://api.typesafe.ai/*',
    ],
    browser_specific_settings: {
      gecko: {
        id: 'doomblock@vichr-vita.github.io',
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['websiteContent', 'authenticationInfo'],
        },
      },
    },
    icons: { 48: 'icon-48.png', 96: 'icon-96.png' },
  },
});
