/**
 * 全局反馈桥（message / dialog）
 * ------------------------------------------------------------------
 * Naive UI 的 useMessage() / useDialog() 必须在 <n-message-provider> /
 * <n-dialog-provider> 内部调用，而业务代码里常常是「在某个异步函数里弹一条提示」，
 * 拿不到组件上下文。
 *
 * 这里在 AppRoot 挂载时把实例注册进来，业务侧统一 import { feedback, confirmDialog } 使用，
 * 不必关心自己在不在 provider 里面。
 *
 * 迁移自 ant-design-vue 的 message / Modal.confirm，调用形状刻意保持一致，
 * 减少迁移时的改写量。
 */
import type { DialogApi, DialogOptions, MessageApi, MessageOptions, MessageReactive } from 'naive-ui'

let messageApi: MessageApi | null = null
let dialogApi: DialogApi | null = null

export const registerFeedback = (message: MessageApi, dialog: DialogApi) => {
  messageApi = message
  dialogApi = dialog
}

export const feedback = {
  success: (content: string, option?: MessageOptions) => messageApi?.success(content, option),
  error: (content: string, option?: MessageOptions) => messageApi?.error(content, option),
  warning: (content: string, option?: MessageOptions) => messageApi?.warning(content, option),
  info: (content: string, option?: MessageOptions) => messageApi?.info(content, option),
  /**
   * 常驻加载提示。返回句柄，用于稍后手动收掉：
   *   const m = feedback.loading('正在导出…');  ...  m?.destroy()
   * （Naive 的 message 不支持 antd 那种「用 key 定位同一条消息并原地替换」，
   *   所以迁移时要改成持句柄的写法。）
   */
  loading: (content: string, option?: MessageOptions): MessageReactive | undefined =>
    messageApi?.loading(content, { duration: 0, ...option }),
  destroyAll: () => messageApi?.destroyAll(),
}

export interface ConfirmOptions {
  title: string
  content?: string
  okText?: string
  cancelText?: string
  onOk?: () => void | Promise<void>
  onCancel?: () => void
}

/**
 * 确认弹窗（对应 antd 的 Modal.confirm）。
 * 刻意保留 onOk / okText / cancelText 这套字段名，迁移时代码几乎不用动。
 */
export const confirmDialog = (options: ConfirmOptions) =>
  dialogApi?.warning({
    title: options.title,
    content: options.content,
    positiveText: options.okText,
    negativeText: options.cancelText,
    onPositiveClick: options.onOk,
    onNegativeClick: options.onCancel,
  } as DialogOptions)

export const hasFeedback = () => Boolean(messageApi && dialogApi)
