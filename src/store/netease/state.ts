export interface WyProfile {
  uid: string
  nickname: string
  avatarUrl: string
  /** 0 普通用户 / 10 音乐包 / 11 黑胶 VIP */
  vipType: number
  signature: string
  follows: number
  followeds: number
  playlistCount: number
}

export interface WyArtist {
  id: number | string
  name: string
  alias?: string[] | null
  albumSize?: number
  picUrl?: string
  img1v1Url?: string
  musicSize?: number
}

const profile: WyProfile = {
  uid: '',
  nickname: '',
  avatarUrl: '',
  vipType: 0,
  signature: '',
  follows: 0,
  followeds: 0,
  playlistCount: 0,
}

const state = {
  profile,
  /** 我喜欢的音乐 ID 集合 */
  likedIds: [] as string[],
  /** 关注的歌手 */
  followedArtists: [] as WyArtist[],
  /** 云盘歌曲数量 */
  cloudCount: 0,
  /** 是否已经拉过账号信息 */
  inited: false,
  /** 正在登录 / 初始化 */
  loading: false,
}

export default state
