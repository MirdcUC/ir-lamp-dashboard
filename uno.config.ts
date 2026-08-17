import { defineConfig, presetUno, presetAttributify } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(), // 提供類似 Tailwind 的工具類
    presetAttributify(), // 支持屬性化模式
  ],
  rules: [],
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-col-center': 'flex flex-col items-center justify-center',
  },
  safelist: [],
})
