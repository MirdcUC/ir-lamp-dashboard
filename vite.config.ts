import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Element Plus 按需引入
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// UnoCSS
import UnoCSS from 'unocss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [
    vue(),
    UnoCSS(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
  ],
  resolve: {
    alias: {
      // 添加 @ 别名(指向 src 目錄)
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
  }
})
