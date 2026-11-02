import state from './state'

export default {
  setList(list: LX.Download.ExtItem[]) {
    state.list = list
    global.state_event.downloadListUpdated(list)
  },
  setTask(id: string, task: Partial<LX.Download.ExtTask>) {
    const prev = state.tasks[id]
    const base: LX.Download.ExtTask = prev ?? {
      id,
      status: 'waiting',
      progress: 0,
      downloaded: 0,
      total: 0,
      speed: 0,
    }
    const next: LX.Download.ExtTask = { ...base, ...task, id }
    state.tasks = { ...state.tasks, [id]: next }
    global.state_event.downloadTaskUpdated(next)
  },
  removeTask(id: string) {
    if (!state.tasks[id]) return
    const tasks = { ...state.tasks }
    delete tasks[id]
    state.tasks = tasks
    global.state_event.downloadTaskRemoved(id)
  },
}
