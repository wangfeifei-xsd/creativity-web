import type { ThemeConfig } from 'antd'

export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#2463eb',
    colorLink: '#2463eb',
    colorBgLayout: '#f4f6fa',
    colorText: '#17243b',
    colorTextSecondary: '#68778f',
    colorTextTertiary: '#8b97ab',
    colorBorder: '#e3e9f2',
    colorBorderSecondary: '#edf0f6',
    borderRadius: 8,
    borderRadiusLG: 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  components: {
    Layout: { headerBg: '#ffffff', siderBg: '#ffffff', headerHeight: 64, headerPadding: '0 28px' },
    Card: { bodyPadding: 28 },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemColor: '#35445e',
      itemSelectedBg: '#eaf1ff',
      itemSelectedColor: '#2463eb',
      itemHoverBg: '#f2f5fa',
      itemHeight: 40,
      itemBorderRadius: 8,
      itemMarginInline: 8,
      itemMarginBlock: 4,
      iconSize: 18,
      groupTitleColor: '#68778f',
      groupTitleFontSize: 12,
    },
    Tabs: { horizontalItemGutter: 32, titleFontSize: 14 },
  },
}

export const authTheme: ThemeConfig = {
  token: {
    ...theme.token,
    colorBorder: '#d8e2f1',
    colorBgContainer: '#ffffff',
    controlHeight: 46,
  },
  components: {
    Button: { primaryShadow: 'none' },
    Input: { activeShadow: '0 0 0 2px rgba(36, 99, 235, 0.1)', paddingInline: 14 },
  },
}
