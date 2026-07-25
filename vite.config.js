import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PWA no navegador da cabine. O agente local (hardware + contingência) virá depois.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: false },
});
