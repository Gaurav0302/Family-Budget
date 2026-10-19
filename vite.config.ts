import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/** A content security policy for the published app: scripts, styles and fonts only from the app itself, data only from
 *  Supabase. (Not in development, where Vite injects its own scripts.) */
const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; worker-src 'self' blob:; manifest-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" />
    <meta name="referrer" content="no-referrer" />`),
});

export default defineConfig({
  base: './',
  plugins: [react(), csp()],
  // Libraries in their own files: they change rarely, so browsers keep them cached between app updates.
  build: { rollupOptions: { output: { manualChunks: { supabase: ['@supabase/supabase-js'], react: ['react', 'react-dom', 'react-router-dom'] } } } },
  test: { environment: 'node' },
} as any);
