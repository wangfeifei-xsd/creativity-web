import type { ThemeConfig } from 'antd'

export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#3159c7',
    colorBgLayout: '#f4f6fa',
    colorText: '#1d2939',
    borderRadius: 8,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  components: {
    Layout: { headerBg: '#ffffff', headerHeight: 64, headerPadding: '0 32px' },
    Card: { bodyPadding: 28 },
  },
}

export const authTheme: ThemeConfig = {
  token: {
    colorPrimary: '#6964c5',
    colorText: '#15243d',
    colorTextSecondary: '#68778f',
    colorBorder: '#e5e0f3',
    colorBgContainer: '#ffffff',
    borderRadius: 8,
    controlHeight: 43,
  },
  components: {
    Button: { primaryShadow: 'none' },
    Input: { activeShadow: '0 0 0 2px rgba(105, 100, 197, 0.1)' },
  },
}
