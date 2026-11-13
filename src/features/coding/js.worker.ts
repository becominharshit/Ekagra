import { runJavaScriptOrTypeScript, type JsRunRequest, type JsWorkerMessage } from './jsRuntime'

const post = (message: JsWorkerMessage) => self.postMessage(message)

// Ready immediately — JS and stripped TypeScript execute natively inside the Worker without external downloads.
post({ type: 'ready' })

self.onmessage = async (event: MessageEvent<{ id: number } & JsRunRequest>) => {
  const { id, ...request } = event.data
  const result = await runJavaScriptOrTypeScript(request)
  post({ type: 'result', id, result })
}
