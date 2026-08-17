import { createApp } from 'vue'
import App from './app/App.vue'
import './shared/styles/index.scss'
import './app/theme'

// 開發模式 ?fakeserial=1:偽造 navigator.serial,無硬體演練完整連線流程(需在 mount 前生效)
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('fakeserial')) {
  const { installFakeWebSerial } = await import('./features/serial/fakeWebSerial')
  installFakeWebSerial()
}

// UnoCSS
import 'virtual:uno.css'

// Create Vue app instance
const app = createApp(App)

// Import and use Element Plus
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// 深色 HMI 主題,搭配 index.html 的 <html class="dark">
import 'element-plus/theme-chalk/dark/css-vars.css'
import zhTw from 'element-plus/es/locale/lang/zh-tw' // 繁體中文語系
const elementConfig = {
    size: 'default' as const,
    zIndex: 3000,
    locale: zhTw,
}
app.use(ElementPlus, elementConfig)

// Import Pinia store
import { createPinia } from 'pinia'
const pinia = createPinia()
app.use(pinia)

// Import Vue Router
import router from './app/router'
app.use(router)

// Mount the app
app.mount('#app')
