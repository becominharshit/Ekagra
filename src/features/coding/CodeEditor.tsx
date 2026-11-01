import { useEffect, useRef } from 'react'
import { indentWithTab } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { keymap } from '@codemirror/view'
import { basicSetup, EditorView } from 'codemirror'

// A Python editor (CodeMirror 6): line numbers, highlighting, brackets that close themselves,
// Tab to indent. Ctrl+Enter (Cmd+Enter on a Mac) runs the code.

const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '14px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', minHeight: '14rem', maxHeight: '60vh' },
  '.cm-gutters': { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', border: 'none' },
})

interface CodeEditorProps {
  value: string
  onChange: (code: string) => void
  onRun?: () => void
  label: string
}

export function CodeEditor({ value, onChange, onRun, label }: CodeEditorProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // The editor is made once; it reads the latest props through these refs.
  const latest = useRef({ value, onChange, onRun, label })
  useEffect(() => {
    latest.current = { value, onChange, onRun, label }
  })

  useEffect(() => {
    const parent = parentRef.current
    if (!parent) return
    const view = new EditorView({
      parent,
      doc: latest.current.value,
      extensions: [
        // First, so Ctrl+Enter runs instead of inserting a line.
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              latest.current.onRun?.()
              return true
            },
          },
          indentWithTab,
        ]),
        basicSetup,
        python(),
        theme,
        EditorView.contentAttributes.of({ 'aria-label': latest.current.label }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) latest.current.onChange(update.state.doc.toString())
        }),
      ],
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // A change from outside (e.g. "Reset to starter code") replaces the text; it can be undone.
  useEffect(() => {
    const view = viewRef.current
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [value])

  return <div ref={parentRef} className="overflow-hidden rounded-lg border" />
}
