import { defineConfig, type ProxyOptions } from 'vite'
import solid from 'vite-plugin-solid'

const proxy: Record<string, ProxyOptions> = {
  '/api': {
    target: 'https://api.dtc.wide.ad.jp',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
}

export default defineConfig({
  plugins: [solid()],
  server: { proxy },
  preview: { proxy },
})
