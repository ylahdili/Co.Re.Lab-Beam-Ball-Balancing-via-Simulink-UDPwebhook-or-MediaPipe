import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'fs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      // Surge SPA fallback: copy index.html to 200.html after build
      {
        name: 'surge-spa-fallback',
        closeBundle() {
          try {
            copyFileSync('dist/index.html', 'dist/200.html');
            console.log('✓ Created 200.html for Surge SPA fallback');
          } catch (e) { /* ignore if dist doesn't exist */ }
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
