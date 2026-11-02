import { httpFetch } from '../../request'
import { weapi } from './utils/crypto'
import musicDetailApi from './musicDetail'

export default {
  /**
   * 新碟上架（全部地区）
   * @param {number} limit
   * @param {number} offset
   */
  async getNewAlbums(limit = 30, offset = 0, retryNum = 0) {
    if (retryNum > 2) return Promise.reject(new Error('获取新碟上架失败'))
    try {
      const requestObj = httpFetch('https://music.163.com/weapi/album/new', {
        method: 'post',
        form: weapi({ area: 'ALL', limit, offset, total: true }),
      })
      const { body } = await requestObj.promise
      if (body.code !== 200) throw new Error('获取新碟上架失败')
      return body.albums ?? []
    } catch (error) {
      return this.getNewAlbums(limit, offset, retryNum + 1)
    }
  },

  /**
   * 获取专辑详情和歌曲
   */
  async getAlbum(albumId, retryNum = 0) {
    if (retryNum > 2) return Promise.reject(new Error('获取专辑详情失败'))
    const requestObj = httpFetch(`https://music.163.com/weapi/v1/album/${albumId}`, {
      method: 'post',
      form: weapi({}),
    })
    try {
      const { body } = await requestObj.promise
      if (body.code !== 200) throw new Error('获取专辑详情失败')
      const privileges = body.songs.map(song => song.privilege)
      const list = await musicDetailApi.filterList({ songs: body.songs, privileges })
      return {
        list,
        info: body.album,
      }
    } catch (error) {
      return this.getAlbum(albumId, retryNum + 1)
    }
  },
}
