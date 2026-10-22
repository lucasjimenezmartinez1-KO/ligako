import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Versión visible en la app (fecha y hora de publicación, hora de Madrid) para saber si el móvil tiene la última
const VERSION = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
});
