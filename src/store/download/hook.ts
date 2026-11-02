import { useEffect, useState } from 'react'
import state from './state'

export const useDownloadList = () => {
  const [value, update] = useState(state.list)

  useEffect(() => {
    const handleUpdate: typeof global.state_event.downloadListUpdated = (list) => {
      update(list)
    }
    global.state_event.on('downloadListUpdated', handleUpdate)
    return () => {
      global.state_event.off('downloadListUpdated', handleUpdate)
    }
  }, [])

  return value
}

/**
 * 订阅单个下载任务的进度，未开始时返回 null
 */
export const useDownloadTask = (id: string) => {
  const [value, update] = useState<LX.Download.ExtTask | null>(state.tasks[id] ?? null)

  useEffect(() => {
    const handleUpdate: typeof global.state_event.downloadTaskUpdated = (task) => {
      if (task.id != id) return
      update(task)
    }
    const handleRemoved: typeof global.state_event.downloadTaskRemoved = (taskId) => {
      if (taskId != id) return
      update(null)
    }
    update(state.tasks[id] ?? null)
    global.state_event.on('downloadTaskUpdated', handleUpdate)
    global.state_event.on('downloadTaskRemoved', handleRemoved)
    return () => {
      global.state_event.off('downloadTaskUpdated', handleUpdate)
      global.state_event.off('downloadTaskRemoved', handleRemoved)
    }
  }, [id])

  return value
}

export const useDownloadTasks = () => {
  const [value, update] = useState(state.tasks)

  useEffect(() => {
    const handleUpdate: typeof global.state_event.downloadTaskUpdated = (task) => {
      update({ ...state.tasks, [task.id]: task })
    }
    const handleRemoved: typeof global.state_event.downloadTaskRemoved = (id) => {
      const tasks = { ...state.tasks }
      delete tasks[id]
      update(tasks)
    }
    global.state_event.on('downloadTaskUpdated', handleUpdate)
    global.state_event.on('downloadTaskRemoved', handleRemoved)
    return () => {
      global.state_event.off('downloadTaskUpdated', handleUpdate)
      global.state_event.off('downloadTaskRemoved', handleRemoved)
    }
  }, [])

  return value
}
