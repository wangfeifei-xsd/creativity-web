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
    colorPrimary: '#424c58',
    colorText: '#292f37',
    colorBorder: '#c3c9d0',
    colorBgContainer: '#fafbfc',
    borderRadius: 4,
    controlHeight: 44,
  },
  components: {
    Input: { activeShadow: '0 0 0 2px rgba(79, 94, 111, 0.1)' },
  },
}
