import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 1421 },
  // Tauri expects a specific environment on Windows
  envPrefix: ['VITE_'],
  build: {
    // Tauri requires ES module output
    target: 'esnext',
  },
});
