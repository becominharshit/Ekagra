export const CODING_LANGUAGES = ['python', 'javascript', 'typescript', 'sql'] as const

export type CodingLanguage = (typeof CODING_LANGUAGES)[number]

export interface LanguageSpec {
  id: CodingLanguage
  label: string
  shortLabel: string
  editorLabel: string
  supportsStdin: boolean
  alwaysOffline: boolean
  defaultCode: string
}

export const LANGUAGE_SPECS: Record<CodingLanguage, LanguageSpec> = {
  python: {
    id: 'python',
    label: 'Python 3',
    shortLabel: 'Python',
    editorLabel: 'Python code',
    supportsStdin: true,
    alwaysOffline: false,
    defaultCode: 'print("Hello from Python!")\n',
  },
  javascript: {
    id: 'javascript',
    label: 'JavaScript',
    shortLabel: 'JS',
    editorLabel: 'JavaScript code',
    supportsStdin: false,
    alwaysOffline: true,
    defaultCode: 'const nums = [1, 2, 3, 4];\nconsole.log("Sum:", nums.reduce((a, b) => a + b, 0));\n',
  },
  typescript: {
    id: 'typescript',
    label: 'TypeScript',
    shortLabel: 'TS',
    editorLabel: 'TypeScript code',
    supportsStdin: false,
    alwaysOffline: true,
    defaultCode:
      'interface Student {\n  name: string;\n  credits: number;\n}\n\nconst student: Student = { name: "Alex", credits: 16 };\nconsole.log(`${student.name}: ${student.credits} credits`);\n',
  },
  sql: {
    id: 'sql',
    label: 'SQL (PostgreSQL)',
    shortLabel: 'SQL',
    editorLabel: 'SQL query',
    supportsStdin: false,
    alwaysOffline: true,
    defaultCode:
      "CREATE TABLE courses (\n  code TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  credits INTEGER NOT NULL\n);\n\nINSERT INTO courses VALUES\n  ('CS101', 'Algorithms', 4),\n  ('MATH201', 'Linear Algebra', 3);\n\nSELECT code, title, credits FROM courses ORDER BY credits DESC;\n",
  },
}

const CODING_LANGUAGE_ALIASES: Record<string, CodingLanguage> = {
  py: 'python',
  python: 'python',
  python3: 'python',
  js: 'javascript',
  javascript: 'javascript',
  node: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  sql: 'sql',
  postgres: 'sql',
  postgresql: 'sql',
  sqlite: 'sql',
}

export function normalizeCodingLanguage(raw: string | null | undefined): CodingLanguage {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return CODING_LANGUAGE_ALIASES[key] ?? 'python'
}
