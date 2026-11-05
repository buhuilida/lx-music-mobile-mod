import { memo } from 'react'

import Version from '../Version'
import About from '../About'
import Credits from '../Other/About'

/**
 * 关于与更新：检查更新 + 版本信息 + 仓库地址 + 致谢声明。
 * 「软件更新」和「关于」原来各占一个大类，都是低频功能，合并成一个。
 */
export default memo(() => {
  return (
    <>
      <Version />
      <About />
      <Credits />
    </>
  )
})
