/**
 * 分享工具
 *
 * 小程序（微信）不允许 JS 主动发起分享，只能：
 * 1. 页面上声明 onShareAppMessage，用户点击右上角「···」触发；
 * 2. 或通过 <button open-type="share"> 触发。
 * 因此这里统一做「开启分享菜单 + 文案引导」。
 */

/** 开启右上角分享菜单（时间线 + 好友） */
export function enableShareMenu(): void {
  // #ifdef MP-WEIXIN
  uni.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline'],
  } as any)
  // #endif
}

/** 引导用户通过右上角菜单分享 */
export function guideShareToFriend(tip = '点击右上角「···」分享给好友'): void {
  enableShareMenu()
  uni.showToast({ title: tip, icon: 'none', duration: 2500 })
}
