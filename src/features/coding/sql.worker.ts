import type { RunRequest } from './python'
import { runSql, type SqlWorkerMessage } from './sql'

const post = (message: SqlWorkerMessage) => self.postMessage(message)

// Signal worker readiness; PGlite instantiates inside the worker when queries execute.
post({ type: 'ready' })

self.onmessage = async (event: MessageEvent<{ id: number } & RunRequest>) => {
  const { id, ...request } = event.data
  const result = await runSql(request)
  post({ type: 'result', id, result })
}
