import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'main',
      component: () => import('@/features/dashboard/DashboardPage.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/features/settings/SettingsPage.vue'),
    },
    {
      path: '/advanced',
      name: 'advanced',
      component: () => import('@/features/advanced-settings/AdvancedSettingsPage.vue'),
    },
  ],
})

export default router
