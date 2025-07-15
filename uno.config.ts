import { createLocalFontProcessor } from '@unocss/preset-web-fonts/local'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  shortcuts: [
    // 按钮基础样式: py-2 设定了垂直内边距
    ['btn', 'px-4 py-2 rounded-md font-semibold text-white transition-colors duration-200 ease-in-out disabled:cursor-default disabled:opacity-60'],
    ['btn-primary', 'btn bg-sky-600 hover:bg-sky-700 disabled:bg-sky-500'],
    ['btn-secondary', 'btn bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400'],
    ['icon-btn', 'inline-block cursor-pointer select-none opacity-75 transition duration-200 ease-in-out hover:opacity-100 hover:text-sky-600'],

    // --- 重点优化 ---
    // 表单输入框:
    // 1. 使用与按钮相同的 py-2
    // 2. 添加 transition-colors
    // 3. 增强 focus 效果: 使用 ring-2 和 ring-offset，并改变边框颜色
    ['form-input', 'mt-1 block w-full rounded-md px-3 py-2 text-base transition-colors duration-200 ease-in-out bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 shadow-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/50'],

    ['form-select', 'form-input'],
    ['form-label', 'block text-sm font-medium text-gray-700 dark:text-gray-300'],
  ],
  presets: [
    presetWind4(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
    }),
    presetTypography(),
    presetWebFonts({
      fonts: {
        sans: 'DM Sans',
        serif: 'DM Serif Display',
        mono: 'DM Mono',
      },
      processors: createLocalFontProcessor(),
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
