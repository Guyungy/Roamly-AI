/**
 * 次数获取操作 composable
 * 统一封装看广告和邀请好友逻辑，消除 Landing/Nearby/Profile 三处重复代码
 */
import { ref } from 'vue'
import { useQuotaStore } from '@/stores/quota'
import { guideShareToFriend } from '@/utils/share'

export function useQuotaAction() {
  const quotaStore = useQuotaStore()
  const showQuotaWall = ref(false)

  /** 检查次数是否充足，不足则弹出 QuotaWall */
  function checkQuota(): boolean {
    quotaStore.ensureToday()
    if (!quotaStore.canPlan) {
      showQuotaWall.value = true
      return false
    }
    return true
  }

  /** 看广告获取次数 */
  function handleWatchAd() {
    if (quotaStore.adCanWatch <= 0) {
      uni.showToast({ title: '今日广告次数已达上限', icon: 'none' })
      return
    }

    // #ifdef MP-WEIXIN
    if ((wx as any).createRewardedVideoAd) {
      const ad = (wx as any).createRewardedVideoAd({ adUnitId: 'adunit-placeholder' })
      ad.onClose((res: { isEnded: boolean }) => {
        if (res && res.isEnded) {
          if (quotaStore.rewardByAd()) {
            showQuotaWall.value = false
            uni.showToast({ title: '+1次规划机会', icon: 'success' })
          } else {
            uni.showToast({ title: '今日广告次数已达上限', icon: 'none' })
          }
        } else {
          uni.showToast({ title: '需完整观看才能获得奖励', icon: 'none' })
        }
      })
      ad.onError(() => uni.showToast({ title: '广告加载失败', icon: 'none' }))
      ad.show().catch(() => ad.load().then(() => ad.show()))
      return
    }
    // #endif

    // 非微信环境 / 开发测试
    if (!quotaStore.rewardByAd()) {
      uni.showToast({ title: '今日广告次数已达上限', icon: 'none' })
      return
    }
    showQuotaWall.value = false
    uni.showToast({ title: '[测试] +1次', icon: 'success' })
  }

  /** 邀请好友获取次数 */
  function handleInvite() {
    showQuotaWall.value = false
    uni.showModal({
      title: '邀请好友',
      content: '分享给好友，好友首次使用后你将获得 3 次规划机会！',
      confirmText: '去分享',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (!res.confirm) return

        // #ifdef MP-WEIXIN
        // 小程序无法主动发起分享：引导用户走右上角分享菜单。
        // 真正的邀请归因必须由服务端在好友首次启动时回传，前端不直接发奖，
        // 否则等于开放无限次数的刷取口子。
        guideShareToFriend('点击右上角「···」分享，好友首次使用后你将获得 3 次')
        // #endif

        // #ifndef MP-WEIXIN
        quotaStore.rewardByInvite()
        uni.showToast({ title: '[测试] +3次', icon: 'success' })
        // #endif
      },
    })
  }

  return {
    showQuotaWall,
    checkQuota,
    handleWatchAd,
    handleInvite,
  }
}
