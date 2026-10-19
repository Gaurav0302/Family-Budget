import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  // Libraries in their own files: they change rarely, so browsers keep them cached between app updates.
  build: { rollupOptions: { output: { manualChunks: { supabase: ['@supabase/supabase-js'], react: ['react', 'react-dom', 'react-router-dom'] } } } },
  test: { environment: 'node' },
} as any);
