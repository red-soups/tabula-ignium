import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = { target: 'http://127.0.0.1:8080', changeOrigin: true }

// NASA FIRMS 공개 화재 CSV에는 CORS 헤더가 없어서 같은 출처 프록시를 거친다: /firms/... → firms.modaps.eosdis.nasa.gov/...
// 배포 환경은 vercel.json의 rewrite가 같은 일을 한다. (src/data/firms.ts)
const firms = {
  target: 'https://firms.modaps.eosdis.nasa.gov',
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/firms/, ''),
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': api,
      '/oauth2': api,
      '/firms': firms,
    },
  },
  preview: { proxy: { '/firms': firms } },
})
