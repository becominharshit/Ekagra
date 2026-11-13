// Lightweight browser-safe TypeScript type-stripper for the Coding Lab.
// Strips common TypeScript syntax (interfaces, type aliases, variable/parameter/return type
// annotations, generics, `as` / `satisfies`, simple enums, accessibility modifiers) while
// preserving line breaks so error line numbers continue matching the student's code.

function blankPreservingNewlines(text: string): string {
  return text.replace(/[^\n]/g, ' ')
}

function skipStringOrComment(code: string, start: number): { end: number; kind: 'comment' | 'string' } | null {
  const ch = code[start]
  const next = code[start + 1]
  if (ch === '/' && next === '/') {
    let i = start + 2
    while (i < code.length && code[i] !== '\n') i += 1
    return { end: i, kind: 'comment' }
  }
  if (ch === '/' && next === '*') {
    let i = start + 2
    while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i += 1
    return { end: Math.min(code.length, i + 2), kind: 'comment' }
  }
  if (ch === '\'' || ch === '"') {
    let i = start + 1
    while (i < code.length) {
      if (code[i] === '\\') {
        i += 2
        continue
      }
      if (code[i] === ch) return { end: i + 1, kind: 'string' }
      i += 1
    }
    return { end: code.length, kind: 'string' }
  }
  return null
}

function skipWhitespace(code: string, idx: number): number {
  let i = idx
  while (i < code.length && /\s/.test(code[i] ?? '')) i += 1
  return i
}

function skipBalanced(code: string, start: number, openChar: string, closeChar: string): number {
  let depth = 0
  let i = start
  while (i < code.length) {
    const sc = skipStringOrComment(code, i)
    if (sc) {
      i = sc.end
      continue
    }
    if (code[i] === openChar) depth += 1
    else if (code[i] === closeChar) {
      depth -= 1
      if (depth === 0) return i + 1
    }
    i += 1
  }
  return code.length
}

/**
 * Scans forward from the start of a type expression until hitting a terminator token at depth 0
 * (`stopChars`), handling `<...>`, `(...)`, `{...}`, `[...]`, unions (`|`), intersections (`&`),
 * arrays (`[]`), and arrow return types (`(a: number) => string`).
 */
function scanTypeEnd(code: string, start: number, stopChars: Set<string>): number {
  let i = start
  let paren = 0
  let bracket = 0
  let brace = 0
  let angle = 0

  while (i < code.length) {
    const sc = skipStringOrComment(code, i)
    if (sc) {
      i = sc.end
      continue
    }
    const ch = code[i] ?? ''
    if (paren === 0 && bracket === 0 && brace === 0 && angle === 0) {
      if (stopChars.has(ch)) {
        // Distinguish `=>` inside function type from `=>` beginning an arrow function body:
        if (ch === '=' && code[i + 1] === '>') {
          // If preceded cleanly in a function-type signature `(x: number) => string`, keep going
          // UNLESS the caller explicitly stopped on `{` or arrow body (handled by stopOnArrowFn).
          if (stopChars.has('=>')) break
          i += 2
          continue
        }
        break
      }
      // Line terminator inside `type Foo = A\nconst b = 1`
      if (ch === '\n') {
        const nextNonSpace = skipWhitespace(code, i + 1)
        const nextChar = code[nextNonSpace] ?? ''
        const rest = code.slice(nextNonSpace)
        if (
          rest.startsWith('const ') ||
          rest.startsWith('let ') ||
          rest.startsWith('var ') ||
          rest.startsWith('function ') ||
          rest.startsWith('async ') ||
          rest.startsWith('interface ') ||
          rest.startsWith('type ') ||
          rest.startsWith('class ') ||
          rest.startsWith('enum ') ||
          rest.startsWith('return ') ||
          rest.startsWith('console.') ||
          nextChar === '}' ||
          nextChar === ')'
        ) {
          break
        }
      }
    }

    if (ch === '(') paren += 1
    else if (ch === ')') {
      if (paren === 0) break
      paren -= 1
    } else if (ch === '[') bracket += 1
    else if (ch === ']') {
      if (bracket === 0) break
      bracket -= 1
    } else if (ch === '{') brace += 1
    else if (ch === '}') {
      if (brace === 0) break
      brace -= 1
    } else if (ch === '<') angle += 1
    else if (ch === '>' && code[i - 1] !== '=') {
      if (angle > 0) angle -= 1
    }
    i += 1
  }
  return i
}

function isIdentStart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z_$]/.test(ch)
}

function isIdentPart(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch)
}

function isWordBoundaryBefore(code: string, idx: number): boolean {
  return idx === 0 || !isIdentPart(code[idx - 1])
}

/** Reads an identifier starting at `idx`. */
function readIdent(code: string, idx: number): { word: string; end: number } | null {
  if (!isIdentStart(code[idx])) return null
  let end = idx + 1
  while (end < code.length && isIdentPart(code[end])) end += 1
  return { word: code.slice(idx, end), end }
}

/** Finds matching `)` for `(` parameters list and strips parameter `: Type` annotations inside. */
function stripParamList(raw: string): string {
  // Recursively strip inner `param: Type` cleanly without breaking defaults like `x = { a: 1 }`
  let out = ''
  let i = 0
  let paren = 0
  let brace = 0
  let bracket = 0

  while (i < raw.length) {
    const sc = skipStringOrComment(raw, i)
    if (sc) {
      out += raw.slice(i, sc.end)
      i = sc.end
      continue
    }
    const ch = raw[i] ?? ''
    if (ch === '(') paren += 1
    else if (ch === ')') paren = Math.max(0, paren - 1)
    else if (ch === '{') brace += 1
    else if (ch === '}') brace = Math.max(0, brace - 1)
    else if (ch === '[') bracket += 1
    else if (ch === ']') bracket = Math.max(0, bracket - 1)

    // Strip parameter accessibility modifiers (`public `, `private `, `protected `, `readonly `)
    if (paren === 1 && brace === 0 && bracket === 0 && isWordBoundaryBefore(raw, i)) {
      const id = readIdent(raw, i)
      if (id && (id.word === 'public' || id.word === 'private' || id.word === 'protected' || id.word === 'readonly')) {
        const after = raw[id.end]
        if (after === ' ' || after === '\t') {
          out += blankPreservingNewlines(raw.slice(i, id.end))
          i = id.end
          continue
        }
      }
    }

    // Optional `?` immediately before `:` or `,` or `)` in top-level parameter list
    if (paren === 1 && brace === 0 && bracket === 0 && ch === '?') {
      const nextIdx = skipWhitespace(raw, i + 1)
      const nextCh = raw[nextIdx]
      if (nextCh === ':' || nextCh === ',' || nextCh === ')' || nextCh === '=') {
        out += ' '
        i += 1
        continue
      }
    }

    // Parameter type annotation `: Type` at parameter depth 1 (not inside default `{ a: 1 }`)
    if (paren === 1 && brace === 0 && bracket === 0 && ch === ':') {
      const stop = new Set([',', ')', '=', '\n'])
      const end = scanTypeEnd(raw, i + 1, stop)
      out += blankPreservingNewlines(raw.slice(i, end))
      i = end
      continue
    }

    out += ch
    i += 1
  }

  return out
}

function transformEnumBody(body: string): string {
  let nextAuto = 0
  // Handle single-line or multi-line enum members while preserving line count cleanly.
  const lines = body.split('\n')
  return lines
    .map((line) => {
      const commentIdx = line.indexOf('//')
      const codePart = commentIdx >= 0 ? line.slice(0, commentIdx) : line
      const commentPart = commentIdx >= 0 ? line.slice(commentIdx) : ''
      if (!codePart.trim()) return line

      // Support comma-separated members on the same line or one member per line.
      const replaced = codePart.replace(/([A-Za-z_$][A-Za-z0-9_$]*)(?:\s*=\s*([^,]+))?/g, (_match, key: string, rawVal?: string) => {
        if (rawVal !== undefined) {
          const trimmed = rawVal.trim()
          const asNum = Number(trimmed)
          if (Number.isInteger(asNum)) nextAuto = asNum + 1
          return `${key}: ${trimmed}`
        }
        const assigned = nextAuto
        nextAuto += 1
        return `${key}: ${assigned}`
      })
      return `${replaced}${commentPart}`
    })
    .join('\n')
}

/** Strips TypeScript types and declarations while preserving newlines and template interpolation. */
export function stripTypeScript(code: string): string {
  let out = ''
  let i = 0
  let braceDepth = 0

  while (i < code.length) {
    // 1. Comments & quotes
    const sc = skipStringOrComment(code, i)
    if (sc) {
      out += code.slice(i, sc.end)
      i = sc.end
      continue
    }

    // 2. Template literals: copy literal parts verbatim and strip inside `${ ... }`
    if (code[i] === '`') {
      out += '`'
      i += 1
      while (i < code.length) {
        if (code[i] === '\\') {
          out += code.slice(i, i + 2)
          i += 2
          continue
        }
        if (code[i] === '`') {
          out += '`'
          i += 1
          break
        }
        if (code[i] === '$' && code[i + 1] === '{') {
          out += '${'
          const exprEnd = skipBalanced(code, i + 2 - 1, '{', '}')
          const inner = code.slice(i + 2, exprEnd - 1)
          out += stripTypeScript(inner)
          out += '}'
          i = exprEnd
          continue
        }
        out += code[i]
        i += 1
      }
      continue
    }

    const ch = code[i] ?? ''

    // 3. Keywords at identifier boundary
    if (isWordBoundaryBefore(code, i)) {
      const id = readIdent(code, i)
      if (id) {
        // `interface Name ... { ... }`
        if (id.word === 'interface' && /\s/.test(code[id.end] ?? '')) {
          let cursor = id.end
          while (cursor < code.length && code[cursor] !== '{') cursor += 1
          if (code[cursor] === '{') {
            const end = skipBalanced(code, cursor, '{', '}')
            out += blankPreservingNewlines(code.slice(i, end))
            i = end
            continue
          }
        }

        // `type Name<...> = ...` (at statement level)
        if (id.word === 'type' && /\s/.test(code[id.end] ?? '')) {
          let cursor = skipWhitespace(code, id.end)
          const name = readIdent(code, cursor)
          if (name) {
            cursor = skipWhitespace(code, name.end)
            if (code[cursor] === '<') cursor = skipWhitespace(code, skipBalanced(code, cursor, '<', '>'))
            if (code[cursor] === '=') {
              const end = scanTypeEnd(code, cursor + 1, new Set([';', '\n']))
              const withSemi = code[end] === ';' ? end + 1 : end
              out += blankPreservingNewlines(code.slice(i, withSemi))
              i = withSemi
              continue
            }
          }
        }

        // `export ` before declarations (stripped for single-file sandbox execution)
        if (id.word === 'export' && /\s/.test(code[id.end] ?? '')) {
          const nextIdx = skipWhitespace(code, id.end)
          const nextId = readIdent(code, nextIdx)
          if (
            nextId &&
            (nextId.word === 'interface' ||
              nextId.word === 'type' ||
              nextId.word === 'enum' ||
              nextId.word === 'function' ||
              nextId.word === 'async' ||
              nextId.word === 'const' ||
              nextId.word === 'let' ||
              nextId.word === 'var')
          ) {
            out += blankPreservingNewlines(id.word)
            i = id.end
            continue
          }
        }

        // `enum Name { ... }` / `const enum Name { ... }`
        if (id.word === 'enum' && /\s/.test(code[id.end] ?? '')) {
          let cursor = skipWhitespace(code, id.end)
          const enumName = readIdent(code, cursor)
          if (enumName) {
            cursor = skipWhitespace(code, enumName.end)
            if (code[cursor] === '{') {
              const end = skipBalanced(code, cursor, '{', '}')
              const body = code.slice(cursor + 1, end - 1)
              out += `const ${enumName.word} = {${transformEnumBody(body)}}`
              i = end
              continue
            }
          }
        }

        // `const name: Type = ...` / `let name: Type = ...` / `var name: Type = ...`
        if (id.word === 'const' || id.word === 'let' || id.word === 'var') {
          if (id.word === 'const') {
            const nextIdx = skipWhitespace(code, id.end)
            const nextId = readIdent(code, nextIdx)
            if (nextId?.word === 'enum' && /\s/.test(code[nextId.end] ?? '')) {
              out += blankPreservingNewlines(code.slice(i, nextIdx))
              i = nextIdx
              continue
            }
          }
          out += id.word
          i = id.end
          const ws = code.slice(i, skipWhitespace(code, i))
          out += ws
          i += ws.length
          const varName = readIdent(code, i)
          if (varName) {
            out += varName.word
            i = varName.end
            const afterVar = skipWhitespace(code, i)
            if (code[afterVar] === '!' && code[afterVar + 1] === ':') {
              out += blankPreservingNewlines(code.slice(i, afterVar + 1))
              i = afterVar + 1
            } else if (code[afterVar] === ':') {
              out += code.slice(i, afterVar)
              i = afterVar
            }
            if (code[i] === ':') {
              const typeEnd = scanTypeEnd(code, i + 1, new Set(['=', ';', ',', '\n']))
              out += blankPreservingNewlines(code.slice(i, typeEnd))
              i = typeEnd
            }
          }
          continue
        }

        // `function name<T>(params): ReturnType {`
        if (id.word === 'function') {
          out += 'function'
          i = id.end
          const ws = code.slice(i, skipWhitespace(code, i))
          out += ws
          i += ws.length
          if (code[i] === '*') {
            out += '*'
            i += 1
            const ws2 = code.slice(i, skipWhitespace(code, i))
            out += ws2
            i += ws2.length
          }
          const fnName = readIdent(code, i)
          if (fnName) {
            out += fnName.word
            i = fnName.end
          }
          const afterName = skipWhitespace(code, i)
          if (code[afterName] === '<') {
            out += code.slice(i, afterName)
            const genEnd = skipBalanced(code, afterName, '<', '>')
            out += blankPreservingNewlines(code.slice(afterName, genEnd))
            i = genEnd
          }
          const beforeParen = skipWhitespace(code, i)
          if (code[beforeParen] === '(') {
            out += code.slice(i, beforeParen)
            const parenEnd = skipBalanced(code, beforeParen, '(', ')')
            out += stripParamList(code.slice(beforeParen, parenEnd))
            i = parenEnd
            const afterParen = skipWhitespace(code, i)
            if (code[afterParen] === ':') {
              out += code.slice(i, afterParen)
              const retEnd = scanTypeEnd(code, afterParen + 1, new Set(['{', '=>']))
              out += blankPreservingNewlines(code.slice(afterParen, retEnd))
              i = retEnd
            }
          }
          continue
        }

        // `as Type` / `satisfies Type`
        if ((id.word === 'as' || id.word === 'satisfies') && /\s/.test(code[id.end] ?? '')) {
          // Ensure `as` isn't `import * as x`
          const prevSlice = out.slice(-20)
          if (!/\*\s+$/.test(prevSlice) && !/\bimport\s+[^;]*$/.test(prevSlice)) {
            const typeEnd = scanTypeEnd(code, id.end + 1, new Set([';', ',', ')', ']', '}', '\n', '=']))
            out += blankPreservingNewlines(code.slice(i, typeEnd))
            i = typeEnd
            continue
          }
        }

        // `readonly` / `public` / `private` / `protected` class/object property modifiers
        if (
          (id.word === 'readonly' || id.word === 'public' || id.word === 'private' || id.word === 'protected') &&
          /\s/.test(code[id.end] ?? '')
        ) {
          out += blankPreservingNewlines(id.word)
          i = id.end
          continue
        }
      }
    }

    // 4. Arrow function `(a: number, b: number): number => ...` or `async (a: number): Promise<void> => ...`
    if (ch === '(') {
      const parenEnd = skipBalanced(code, i, '(', ')')
      const afterParen = skipWhitespace(code, parenEnd)
      // Look ahead past optional `: ReturnType` to see if `=>` follows!
      if (code[afterParen] === ':') {
        const retEnd = scanTypeEnd(code, afterParen + 1, new Set(['=>', ';', '\n', '{']))
        const afterRet = skipWhitespace(code, retEnd)
        if (code.slice(afterRet, afterRet + 2) === '=>') {
          out += stripParamList(code.slice(i, parenEnd))
          out += blankPreservingNewlines(code.slice(parenEnd, retEnd))
          i = retEnd
          continue
        }
      } else if (code.slice(afterParen, afterParen + 2) === '=>') {
        out += stripParamList(code.slice(i, parenEnd))
        i = parenEnd
        continue
      }
    }

    if (ch === '{') braceDepth += 1
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1)
    void braceDepth

    out += ch
    i += 1
  }

  return out
}
