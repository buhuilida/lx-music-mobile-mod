export interface PlatformAccount {
  /** 账号唯一标识：QQ 音乐是 uin，酷狗是 userid */
  uid: string
  nickname: string
  avatar: string
  /** 是否已经成功拉过账号信息 */
  inited: boolean
  /** 正在初始化 / 刷新 */
  loading: boolean
}

const createAccount = (): PlatformAccount => ({
  uid: '',
  nickname: '',
  avatar: '',
  inited: false,
  loading: false,
})

const state = {
  tx: createAccount(),
  kg: createAccount(),
}

export { createAccount }
export default state
