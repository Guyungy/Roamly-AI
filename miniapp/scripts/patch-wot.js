/**
 * 修补 wot-design-uni 中的 v-bind="obj" 语法
 * 
 * dcloudio mp-weixin 编译器不支持 v-bind="obj" 动态绑定，
 * 此脚本将其替换为逐属性绑定或移除 badge 的动态绑定。
 * 
 * 在 npm install 后自动运行 (postinstall)
 */
const fs = require('fs')
const path = require('path')

const WOT_DIR = path.join(__dirname, '..', 'node_modules', 'wot-design-uni', 'components')

const patches = [
  {
    file: 'wd-tabs/wd-tabs.vue',
    replacements: [
      [/v-bind="item\.badgeProps"/g, ':is-dot="item.badgeProps?.isDot" :model-value="item.badgeProps?.modelValue" :type="item.badgeProps?.type"']
    ]
  },
  {
    file: 'wd-grid-item/wd-grid-item.vue',
    replacements: [
      [/v-bind="customBadgeProps"/g, '']
    ]
  },
  {
    file: 'wd-loadmore/wd-loadmore.vue',
    replacements: [
      [/v-bind="customLoadingProps"/g, '']
    ]
  },
  {
    file: 'wd-message-box/wd-message-box.vue',
    replacements: [
      [/v-bind="customCancelProps"/g, ''],
      [/v-bind="customConfirmProps"/g, '']
    ]
  },
  {
    file: 'wd-sidebar-item/wd-sidebar-item.vue',
    replacements: [
      [/v-bind="customBadgeProps"/g, '']
    ]
  },
  {
    file: 'wd-tabbar-item/wd-tabbar-item.vue',
    replacements: [
      [/v-bind="customBadgeProps"/g, '']
    ]
  }
]

let patched = 0

for (const p of patches) {
  const filePath = path.join(WOT_DIR, p.file)
  if (!fs.existsSync(filePath)) {
    console.log(`  SKIP ${p.file} (not found)`)
    continue
  }

  let content = fs.readFileSync(filePath, 'utf8')
  let changed = false

  for (const [search, replace] of p.replacements) {
    if (search.test(content)) {
      content = content.replace(search, replace)
      changed = true
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log(`  PATCH ${p.file}`)
    patched++
  }
}

console.log(`\n  wot-design-uni: patched ${patched} files (v-bind compat)\n`)
