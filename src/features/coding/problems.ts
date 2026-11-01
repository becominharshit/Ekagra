import { CodeAnswerSchema, CodeTestsSchema, type CodeAnswer, type CodeTest } from '@shared/schemas.ts'
import type { Json, TablesInsert } from '@/types/database'

// Code problems are questions with type "code": the prompt (first line = title), the tests in
// questions.tests and the starter code + model solution in questions.answer. This file has the
// app's starter set and helpers to read a problem safely.

export interface StarterProblem {
  key: string
  prompt: string
  difficulty: number
  answer: CodeAnswer
  tests: CodeTest[]
}

const fn = (header: string, hint: string) => `${header}\n    # ${hint}\n    pass\n`

export const STARTER_PROBLEMS: StarterProblem[] = [
  {
    key: 'total',
    prompt: 'Add up a list\n\nWrite a function `total(numbers)` that returns the sum of all numbers in the list, **without** using the built-in `sum()`. An empty list adds up to 0.',
    difficulty: 1,
    answer: {
      starter: fn('def total(numbers):', 'Go through the numbers and add them up'),
      solution: 'def total(numbers):\n    result = 0\n    for number in numbers:\n        result += number\n    return result\n',
    },
    tests: [
      { call: 'total([1, 2, 3])', expected: '6' },
      { call: 'total([])', expected: '0' },
      { call: 'total([-5, 5, 10])', expected: '10' },
      { call: 'total([2.5, 2.5])', expected: '5.0' },
    ],
  },
  {
    key: 'factorial',
    prompt: 'Factorial\n\nWrite a function `factorial(n)` that returns n! = 1 × 2 × … × n. By definition, 0! = 1.',
    difficulty: 1,
    answer: {
      starter: fn('def factorial(n):', 'Multiply 1 × 2 × … × n'),
      solution: 'def factorial(n):\n    result = 1\n    for k in range(2, n + 1):\n        result *= k\n    return result\n',
    },
    tests: [
      { call: 'factorial(0)', expected: '1' },
      { call: 'factorial(1)', expected: '1' },
      { call: 'factorial(5)', expected: '120' },
      { call: 'factorial(10)', expected: '3628800' },
    ],
  },
  {
    key: 'count_vowels',
    prompt: 'Count the vowels\n\nWrite a function `count_vowels(text)` that returns how many vowels (a, e, i, o, u) the text has. Capital letters count too.',
    difficulty: 1,
    answer: {
      starter: fn('def count_vowels(text):', 'Count the letters that are vowels'),
      solution: 'def count_vowels(text):\n    return sum(1 for letter in text.lower() if letter in "aeiou")\n',
    },
    tests: [
      { call: 'count_vowels("hello")', expected: '2' },
      { call: 'count_vowels("AEIOU")', expected: '5' },
      { call: 'count_vowels("rhythm")', expected: '0' },
      { call: 'count_vowels("Programming in Python")', expected: '5' },
    ],
  },
  {
    key: 'largest',
    prompt: 'Largest number\n\nWrite a function `largest(numbers)` that returns the biggest number of a list that is not empty, **without** using `max()`.',
    difficulty: 1,
    answer: {
      starter: fn('def largest(numbers):', 'Remember the biggest number seen so far'),
      solution: 'def largest(numbers):\n    biggest = numbers[0]\n    for number in numbers[1:]:\n        if number > biggest:\n            biggest = number\n    return biggest\n',
    },
    tests: [
      { call: 'largest([3, 9, 2])', expected: '9' },
      { call: 'largest([-4, -2, -8])', expected: '-2' },
      { call: 'largest([7])', expected: '7' },
    ],
  },
  {
    key: 'is_palindrome',
    prompt: 'Palindrome\n\nWrite a function `is_palindrome(text)` that returns `True` if the text reads the same backwards. Ignore capital letters and spaces.',
    difficulty: 2,
    answer: {
      starter: fn('def is_palindrome(text):', 'Clean the text first, then compare it with its reverse'),
      solution: 'def is_palindrome(text):\n    cleaned = text.replace(" ", "").lower()\n    return cleaned == cleaned[::-1]\n',
    },
    tests: [
      { call: 'is_palindrome("racecar")', expected: 'True' },
      { call: 'is_palindrome("Never odd or even")', expected: 'True' },
      { call: 'is_palindrome("python")', expected: 'False' },
      { call: 'is_palindrome("")', expected: 'True' },
    ],
  },
  {
    key: 'fizzbuzz',
    prompt:
      'FizzBuzz\n\nWrite a function `fizzbuzz(n)` that returns a list of strings for the numbers 1 to n: `"Fizz"` for multiples of 3, `"Buzz"` for multiples of 5, `"FizzBuzz"` for multiples of both, and the number itself otherwise.',
    difficulty: 2,
    answer: {
      starter: fn('def fizzbuzz(n):', 'Build the list one number at a time'),
      solution:
        'def fizzbuzz(n):\n    result = []\n    for k in range(1, n + 1):\n        if k % 15 == 0:\n            result.append("FizzBuzz")\n        elif k % 3 == 0:\n            result.append("Fizz")\n        elif k % 5 == 0:\n            result.append("Buzz")\n        else:\n            result.append(str(k))\n    return result\n',
    },
    tests: [
      { call: 'fizzbuzz(5)', expected: "['1', '2', 'Fizz', '4', 'Buzz']" },
      { call: 'fizzbuzz(15)[-1]', expected: "'FizzBuzz'" },
      { call: 'fizzbuzz(0)', expected: '[]' },
    ],
  },
  {
    key: 'is_prime',
    prompt: 'Prime numbers\n\nWrite a function `is_prime(n)` that returns `True` if n is a prime number: it has exactly two divisors, 1 and itself.',
    difficulty: 2,
    answer: {
      starter: fn('def is_prime(n):', 'Try dividing n by smaller numbers'),
      solution:
        'def is_prime(n):\n    if n < 2:\n        return False\n    k = 2\n    while k * k <= n:\n        if n % k == 0:\n            return False\n        k += 1\n    return True\n',
    },
    tests: [
      { call: 'is_prime(2)', expected: 'True' },
      { call: 'is_prime(1)', expected: 'False' },
      { call: 'is_prime(17)', expected: 'True' },
      { call: 'is_prime(21)', expected: 'False' },
      { call: 'is_prime(97)', expected: 'True' },
    ],
  },
  {
    key: 'word_counts',
    prompt: 'Count the words\n\nWrite a function `word_counts(text)` that returns a dictionary with each word of the text in lower case and how many times it appears.',
    difficulty: 2,
    answer: {
      starter: fn('def word_counts(text):', 'Split the text into words and count them in a dictionary'),
      solution: 'def word_counts(text):\n    counts = {}\n    for word in text.lower().split():\n        counts[word] = counts.get(word, 0) + 1\n    return counts\n',
    },
    tests: [
      { call: 'word_counts("the cat and the hat")', expected: "{'the': 2, 'cat': 1, 'and': 1, 'hat': 1}" },
      { call: 'word_counts("Go go GO")', expected: "{'go': 3}" },
      { call: 'word_counts("")', expected: '{}' },
    ],
  },
]

/** The starter problems as question rows, numbered so they keep this order. */
export function starterRows(skipKeys: Set<string>): TablesInsert<'questions'>[] {
  return STARTER_PROBLEMS.map((problem, order) => ({ problem, order }))
    .filter(({ problem }) => !skipKeys.has(problem.key))
    .map(({ problem, order }) => ({
      source: 'manual',
      type: 'code',
      prompt: problem.prompt,
      difficulty: problem.difficulty,
      tests: problem.tests,
      answer: problem.answer,
      source_ref: { set: 'starter', key: problem.key, order },
    }))
}

/** The key and order of a starter problem (from questions.source_ref), if it is one. */
export function starterRef(sourceRef: Json): { key: string; order: number } | null {
  if (typeof sourceRef !== 'object' || sourceRef === null || Array.isArray(sourceRef)) return null
  const { set, key, order } = sourceRef
  return set === 'starter' && typeof key === 'string' && typeof order === 'number' ? { key, order } : null
}

/** A problem's title: the first line of its prompt (without Markdown marks). */
export function problemTitle(prompt: string): string {
  const first = prompt.trim().split('\n')[0] ?? ''
  return first.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim().slice(0, 120) || 'Code problem'
}

/** A problem's description: everything after the title line. */
export function problemBody(prompt: string): string {
  return prompt.trim().split('\n').slice(1).join('\n').trim()
}

/** The tests saved with a problem. Anything broken counts as "no tests". */
export function readCodeTests(tests: Json): CodeTest[] {
  const parsed = CodeTestsSchema.safeParse(tests)
  return parsed.success ? parsed.data : []
}

/** The starter code and model solution saved with a problem, or null. */
export function readCodeAnswer(answer: Json): CodeAnswer | null {
  const parsed = CodeAnswerSchema.safeParse(answer)
  return parsed.success ? parsed.data : null
}
