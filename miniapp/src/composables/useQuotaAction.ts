/**
 * 次数获取操作 composable
 * 统一封装看广告和邀请好友逻辑，消除 Landing/Nearby/Profile 三处重复代码
 */
import { ref } from 'vue'
import { useQuotaStore } from '@/stores/quota'

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
          quotaStore.rewardByAd()
          showQuotaWall.value = false
          uni.showToast({ title: '+1次规划机会', icon: 'success' })
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
    quotaStore.rewardByAd()
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
        if (res.confirm) {
          // #ifndef MP-WEIXIN
          quotaStore.rewardByInvite()
          uni.showToast({ title: '[测试] +3次', icon: 'success' })
          // #endif
        }
      }
    })
  }

  return {
    showQuotaWall,
    checkQuota,
    handleWatchAd,
    handleInvite,
  }
}
