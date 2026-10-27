import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig(() => ({base: process.env.VITE_BASE_PATH || '/',plugins:[react(),VitePWA({registerType:'autoUpdate',manifest:{name:'Workout Grove Web',short_name:'Workout Grove',description:'개인 운동 기록 웹앱',theme_color:'#101115',background_color:'#101115',display:'standalone',start_url:'.',icons:[{src:'icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]}})]}));

