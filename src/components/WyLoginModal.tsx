import { memo } from 'react'

import PlatformLoginModal from '@/components/PlatformLoginModal'

/**
 * 兼容层：1.21.x 用的是 WyLoginModal，1.22.0 起统一到 PlatformLoginModal。
 * 这里保留原导出，避免其他页面引用失效。
 */
interface Props {
  visible: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default memo(({ visible, onClose, onSuccess }: Props) => (
  <PlatformLoginModal visible={visible} platform="wy" onClose={onClose} onSuccess={onSuccess} />
))
