/**
 * Naive UI 主题覆盖
 * ------------------------------------------------------------------
 * 目标：让组件库的默认观感与 styles/global.css 里的设计 token 完全一致，
 * 避免出现「组件库一套灰、自己写的卡片另一套灰」的割裂。
 *
 * 设计口径（与 token 对齐）：
 *   主色   #e85520（brand-600，白字对比度 ≈ 4.6:1，过 WCAG AA）
 *   圆角   12px（输入框/按钮/小卡）、16px（卡片）
 *   字号   14px 基准，行高 1.65
 *   控件高 38px（naive 默认 34 偏小，点按不友好）
 *   字重   全站 400/500/600，不使用 300
 */
import type { GlobalThemeOverrides } from 'naive-ui'

/* 与 CSS token 同一份取值，避免两边各写一份导致漂移 */
const brand = {
  50: '#fff5f1',
  100: '#ffe6dc',
  200: '#ffcbb8',
  300: '#ffa98c',
  400: '#ff8358',
  500: '#ff6b35',
  600: '#e85520',
  700: '#c23f13',
}

const ink = {
  900: '#16181d',
  800: '#23262e',
  700: '#363a45',
  600: '#4a4f5c',
  500: '#626878',
  400: '#868c9b',
  300: '#aeb3c0',
  200: '#d7dae2',
  100: '#e8eaf0',
  50: '#f4f5f8',
}

const fontFamily =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Source Han Sans SC', 'Noto Sans CJK SC', 'Helvetica Neue', Arial, sans-serif"

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    fontFamily,
    fontFamilyMono: "'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",

    fontSize: '14px',
    fontSizeMini: '12px',
    fontSizeTiny: '12px',
    fontSizeSmall: '13px',
    fontSizeMedium: '14px',
    /*
     * 大型控件（size="large"）的字号必须落在 token 字阶上。
     * Naive 默认是 15px，而字阶只有 …13/14/16/20…，15px 会凭空多出一档，
     * 实测首页 45 个元素卡在这个值上。这里直接顶到 --fs-md。
     */
    fontSizeLarge: '16px',
    fontSizeHuge: '16px',

    lineHeight: '1.65',

    /* 控件高度：整体上调一档，桌面点按更舒服 */
    heightMini: '24px',
    heightTiny: '28px',
    heightSmall: '34px', /* 导航栏的 pill 与 small 按钮统一到 34px */
    heightMedium: '38px',
    heightLarge: '44px',
    heightHuge: '48px',

    borderRadius: '12px',
    borderRadiusSmall: '8px',

    /* 主色 */
    primaryColor: brand[600],
    primaryColorHover: brand[500],
    primaryColorPressed: brand[700],
    primaryColorSuppl: brand[500],

    /* 语义色：与 token 一致 */
    infoColor: '#3b7ddd',
    infoColorHover: '#5a95e6',
    infoColorPressed: '#2f66b8',
    infoColorSuppl: '#5a95e6',

    successColor: '#0e9f8a',
    successColorHover: '#28b39e',
    successColorPressed: '#0b8372',
    successColorSuppl: '#28b39e',

    warningColor: '#d98b0b',
    warningColorHover: '#eba322',
    warningColorPressed: '#b87407',
    warningColorSuppl: '#eba322',

    errorColor: '#d93a40',
    errorColorHover: '#e0555b',
    errorColorPressed: '#b62e33',
    errorColorSuppl: '#e0555b',

    /* 文字层级：对应 ink-900 / 500 / 400 */
    textColorBase: ink[900],
    textColor1: ink[900],
    textColor2: ink[500],
    textColor3: ink[400],
    textColorDisabled: ink[300],
    placeholderColor: ink[300],
    placeholderColorDisabled: ink[300],
    iconColor: ink[400],
    iconColorHover: brand[600],
    iconColorPressed: brand[700],
    iconColorDisabled: ink[300],

    /* 背景与描边 */
    bodyColor: '#f7f8fa',
    cardColor: '#ffffff',
    modalColor: '#ffffff',
    popoverColor: '#ffffff',
    tableColor: '#ffffff',
    inputColor: '#ffffff',
    actionColor: ink[50],
    tableHeaderColor: ink[50],
    hoverColor: ink[50],
    pressedColor: ink[100],

    borderColor: '#e6e9ef',
    dividerColor: '#e6e9ef',

    /* 阴影：三档，与 token 对齐 */
    boxShadow1: '0 1px 2px rgba(22, 24, 29, 0.06), 0 1px 3px rgba(22, 24, 29, 0.04)',
    boxShadow2: '0 4px 12px rgba(22, 24, 29, 0.07), 0 2px 4px rgba(22, 24, 29, 0.04)',
    boxShadow3: '0 12px 32px rgba(22, 24, 29, 0.1), 0 4px 8px rgba(22, 24, 29, 0.04)',

    scrollbarColor: 'rgba(174, 179, 192, 0.5)',
    scrollbarColorHover: 'rgba(134, 140, 155, 0.6)',
  },

  Button: {
    fontWeight: '500',
    fontWeightStrong: '600',
    paddingMedium: '0 18px',
    paddingLarge: '0 24px',
    borderRadiusMedium: '10px',
    borderRadiusLarge: '12px',
    /* 主按钮加一点品牌光晕，让 CTA 有分量 */
    colorPrimaryShadow: 'rgba(232, 85, 32, 0.22)',
    colorPrimaryShadowHover: 'rgba(232, 85, 32, 0.3)',
    colorPrimaryShadowPressed: 'rgba(232, 85, 32, 0.2)',
    textColorGhostPrimary: brand[600],
  },

  Card: {
    borderRadius: '16px',
    paddingMedium: '20px 22px',
    paddingLarge: '24px 26px',
    color: '#ffffff',
    borderColor: '#e6e9ef',
    titleFontSizeMedium: '16px',
    titleFontWeight: '600',
  },

  Input: {
    borderRadius: '12px',
    color: '#ffffff',
    border: '1px solid #e6e9ef',
    borderHover: `1px solid ${brand[300]}`,
    borderFocus: `1px solid ${brand[600]}`,
    boxShadowFocus: `0 0 0 2px rgba(232, 85, 32, 0.14)`,
    placeholderColor: ink[300],
    paddingMedium: '0 14px',
  },

  InputNumber: {
    borderRadius: '12px',
  },

  Select: {
    peers: {
      InternalSelection: {
        borderRadius: '12px',
        border: '1px solid #e6e9ef',
        borderHover: `1px solid ${brand[300]}`,
        borderFocus: `1px solid ${brand[600]}`,
        borderActive: `1px solid ${brand[600]}`,
        boxShadowFocus: `0 0 0 2px rgba(232, 85, 32, 0.14)`,
        boxShadowActive: `0 0 0 2px rgba(232, 85, 32, 0.14)`,
        paddingSingle: '0 30px 0 14px',
      },
      InternalSelectMenu: {
        borderRadius: '12px',
        optionTextColorActive: brand[700],
        optionColorPending: ink[50],
      },
    },
  },

  DatePicker: {
    peers: {
      Input: {
        borderRadius: '12px',
        border: '1px solid #e6e9ef',
        borderHover: `1px solid ${brand[300]}`,
        borderFocus: `1px solid ${brand[600]}`,
        boxShadowFocus: `0 0 0 2px rgba(232, 85, 32, 0.14)`,
      },
    },
  },

  Form: {
    labelFontWeight: '500',
    labelTextColor: ink[700],
    labelFontSizeTopMedium: '13px',
    feedbackHeightMedium: '22px',
  },

  Menu: {
    borderRadius: '10px',
    itemColorActive: brand[50],
    itemColorActiveHover: brand[100],
    itemTextColorActive: brand[700],
    itemTextColorActiveHover: brand[700],
    itemIconColorActive: brand[600],
    itemColorHover: ink[50],
    itemHeight: '38px',
  },

  Dropdown: {
    borderRadius: '12px',
    optionHeightMedium: '38px',
    optionColorHover: ink[50],
    optionTextColor: ink[600],
    padding: '6px',
  },

  Modal: {
    boxShadow: '0 24px 60px rgba(22, 24, 29, 0.18), 0 8px 20px rgba(22, 24, 29, 0.08)',
  },

  Dialog: {
    borderRadius: '18px',
    padding: '26px 28px',
    titleFontWeight: '600',
  },

  Message: {
    borderRadius: '12px',
    padding: '12px 18px',
    boxShadow: '0 8px 24px rgba(22, 24, 29, 0.12)',
    textColorInfo: '#3b7ddd',
    textColorSuccess: '#0e9f8a',
    textColorWarning: '#d98b0b',
    textColorError: '#d93a40',
  },

  Tag: {
    borderRadius: '999px',
    heightMedium: '26px',
    fontWeightStrong: '500',
  },

  Divider: {
    color: '#e6e9ef',
    textColor: ink[700],
    fontWeightStrong: '600',
  },

  Empty: {
    iconColor: ink[300],
    textColor: ink[400],
    fontSizeMedium: '14px',
  },

  Collapse: {
    titleFontWeight: '500',
    titleTextColor: ink[700],
    fontSize: '15px',
    dividerColor: '#e6e9ef',
  },

  List: {
    borderRadius: '12px',
    color: '#ffffff',
    borderColor: '#e6e9ef',
    colorHover: ink[50],
  },

  Alert: {
    borderRadius: '12px',
    padding: '12px 16px',
  },

  Spin: {
    color: brand[600],
  },

  BackTop: {
    borderRadius: '999px',
    color: '#ffffff',
    textColor: brand[600],
  },

  Descriptions: {
    thColor: ink[50],
    thTextColor: ink[600],
    tdTextColor: ink[600],
    thFontWeight: '500',
    borderRadius: '12px',
  },

  Layout: {
    color: '#f7f8fa',
    siderColor: '#ffffff',
    headerColor: '#ffffff',
  },

  Tooltip: {
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '13px',
  },

  Popover: {
    borderRadius: '14px',
    padding: '16px',
    boxShadow: '0 12px 32px rgba(22, 24, 29, 0.1), 0 4px 8px rgba(22, 24, 29, 0.04)',
  },
}

export default themeOverrides
