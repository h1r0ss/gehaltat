import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset and data URLs, so the same build works at a domain root and under a
  // GitHub Pages project path such as https://<user>.github.io/<repo>/.
  base: './',
});
