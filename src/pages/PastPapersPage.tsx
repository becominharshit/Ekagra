import { useEffect, useState } from 'react'
import { ArrowLeft, LoaderCircle, Plus, Save, Sparkles, Trash2, X } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { readPastPaper } from '@/features/academics/academicsAi'
import { clearImport, waitingImport } from '@/features/academics/importHandoff'
import { countLabel } from '@/features/academics/labels'
import { deletePaper, savePaper, usePapers, type PastPaper } from '@/features/academics/papers'
import { draftsFromAnswer, leafTopics, topicKeys, type Question, type QuestionDraft } from '@/features/academics/pastPapers'
import { useRoadmap } from '@/features/academics/roadmap'
import { EMPTY_SOURCE, sourceReady, type SourceDraft } from '@/features/academics/source'
import { SourcePicker } from '@/features/academics/SourcePicker'
import { useAcademicsMutation, useSubject, type Subject } from '@/features/academics/subjects'
import type { Topic } from '@/features/academics/topicTree'
import { DEMO_AI_NOTE } from '@/features/ai/demoAi'
import { useAuthStore } from '@/features/auth/authStore'
import { need, useDataSource } from '@/lib/dataSource'

const NO_TOPIC = 'none'

/** A subject's past papers. Their questions decide which topics get the highest priority. */
export function PastPapersPage() {
  const { subjectId } = useParams()
  const subject = useSubject(subjectId)
  const roadmap = useRoadmap(subjectId)
  const papers = usePapers(subjectId)

  if (subject.isPending || roadmap.isPending || papers.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if (!subject.data || !roadmap.data || !papers.data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {subject.error?.message ?? roadmap.error?.message ?? papers.error?.message ?? 'This subject was not found.'}
      </p>
    )
  }
  return <PapersView subject={subject.data} topics={leafTopics(roadmap.data.topics)} papers={papers.data.papers} questions={papers.data.questions} />
}

function PapersView({ subject, topics, papers, questions }: { subject: Subject; topics: Topic[]; papers: PastPaper[]; questions: Question[] }) {
  // A paper added through the Add inbox opens the form straight away.
  const [adding, setAdding] = useState(() => waitingImport(subject.id, 'past_paper') !== null)
  const remove = useAcademicsMutation(deletePaper)

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to={`/academics/subjects/${subject.id}`}>
          <ArrowLeft aria-hidden />
          {subject.name}
        </Link>
      </Button>
      <PageHeader title="Past papers" subtitle="Topics that are asked more often, for more marks, get a higher priority." />

      <div className="grid gap-4">
        {topics.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Import the syllabus first</CardTitle>
              <CardDescription>Questions are matched to the topics of your roadmap.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to={`/academics/subjects/${subject.id}/import`}>Import syllabus</Link>
              </Button>
            </CardContent>
          </Card>
        ) : adding ? (
          <AddPaper subject={subject} topics={topics} onDone={() => setAdding(false)} />
        ) : (
          <Button className="justify-self-start" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add a past paper
          </Button>
        )}

        {papers.map((paper) => {
          const own = questions.filter((question) => question.past_paper_id === paper.id)
          const matched = own.filter((question) => question.topic_id !== null).length
          return (
            <Card key={paper.id} size="sm">
              <CardHeader>
                <CardTitle>{[paper.year ?? 'Year unknown', paper.exam_type].filter(Boolean).join(' · ')}</CardTitle>
                <CardDescription>
                  {countLabel(own.length, 'question')}, {matched} matched to topics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ subjectId: subject.id, paperId: paper.id })}
                >
                  <Trash2 aria-hidden />
                  Delete
                </Button>
              </CardContent>
            </Card>
          )
        })}
        {remove.error && (
          <p role="alert" className="text-sm text-destructive">
            {remove.error.message}
          </p>
        )}
      </div>
    </>
  )
}

interface Review {
  year: string
  examType: string
  questions: QuestionDraft[]
  promptVersion: string | null
}

function AddPaper({ subject, topics, onDone }: { subject: Subject; topics: Topic[]; onDone: () => void }) {
  const isDemo = useAuthStore((state) => state.status === 'demo')
  const { source } = useDataSource()
  const [year, setYear] = useState(() => String(waitingImport(subject.id, 'past_paper')?.year ?? ''))
  const [input, setInput] = useState<SourceDraft>(() => waitingImport(subject.id, 'past_paper')?.source ?? EMPTY_SOURCE)
  useEffect(() => clearImport(subject.id, 'past_paper'), [subject.id])
  const [review, setReview] = useState<Review | null>(null)
  const [reading, setReading] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const save = useAcademicsMutation(savePaper)

  const givenYear = /^\d{4}$/.test(year.trim()) ? Number(year.trim()) : null

  async function read() {
    setReading(true)
    setProblem(null)
    try {
      const { list, idByKey } = topicKeys(topics)
      const answer = await readPastPaper(need(source), {
        subjectName: subject.name,
        topics: list,
        year: givenYear,
        text: input.text.trim() || undefined,
        file: input.file ?? undefined,
      })
      if (answer.questions.length === 0) throw new Error('No questions were found in that paper.')
      setReview({
        year: String(answer.year ?? givenYear ?? ''),
        examType: answer.examType ?? '',
        questions: draftsFromAnswer(answer, idByKey),
        promptVersion: answer.promptVersion,
      })
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The paper could not be read. Please try again.')
    } finally {
      setReading(false)
    }
  }

  if (!review) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Add a past paper</CardTitle>
          <CardDescription>The AI lists its questions and matches each one to a topic. You check them before saving.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="paper-year">Year (if the paper doesn't show it)</Label>
            <Input id="paper-year" inputMode="numeric" placeholder="e.g. 2024" className="w-32" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <SourcePicker
            value={input}
            onChange={setInput}
            isDemo={isDemo}
            what="past paper"
            placeholder={'Paste the questions, for example:\nQ1. Draw an ER diagram for a library. (10 marks)\nQ2. Write a SQL query with GROUP BY. (5 marks)'}
          />
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button className="flex-1" disabled={!sourceReady(input) || reading} onClick={() => void read()}>
              {reading ? <LoaderCircle className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              {reading ? 'Reading the paper…' : 'Read the questions'}
            </Button>
            <Button variant="outline" onClick={onDone}>
              Cancel
            </Button>
          </div>
          {isDemo && <p className="text-xs text-muted-foreground">{DEMO_AI_NOTE}</p>}
        </CardContent>
      </Card>
    )
  }

  const setQuestion = (index: number, patch: Partial<QuestionDraft>) =>
    setReview({ ...review, questions: review.questions.map((question, i) => (i === index ? { ...question, ...patch } : question)) })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check the questions</CardTitle>
        <CardDescription>
          {countLabel(review.questions.length, 'question')} found. Fix a topic or the marks if needed, then save.
          {isDemo ? ` ${DEMO_AI_NOTE}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="review-year">Year</Label>
            <Input id="review-year" inputMode="numeric" value={review.year} onChange={(e) => setReview({ ...review, year: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="review-type">Exam</Label>
            <Input id="review-type" placeholder="e.g. End semester" value={review.examType} onChange={(e) => setReview({ ...review, examType: e.target.value })} />
          </div>
        </div>

        <ol className="grid gap-3">
          {review.questions.map((question, index) => (
            <li key={`${index}-${question.text.slice(0, 20)}`} className="grid gap-2 rounded-lg bg-muted/40 p-2.5">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm">{question.text}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove this question"
                  onClick={() => setReview({ ...review, questions: review.questions.filter((_, i) => i !== index) })}
                >
                  <X aria-hidden />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={question.topicId ?? NO_TOPIC} onValueChange={(next) => setQuestion(index, { topicId: next === NO_TOPIC ? null : next })}>
                  <SelectTrigger size="sm" className="max-w-full min-w-0" aria-label="Topic">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TOPIC}>No matching topic</SelectItem>
                    {topics.map((topic) => (
                      <SelectItem key={topic.id} value={topic.id}>
                        {topic.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Input
                    inputMode="decimal"
                    aria-label="Marks"
                    className="h-7 w-16"
                    value={question.marks ?? ''}
                    onChange={(event) => {
                      const marks = Number(event.target.value)
                      setQuestion(index, { marks: event.target.value === '' || !Number.isFinite(marks) ? null : marks })
                    }}
                  />
                  marks
                </label>
              </div>
            </li>
          ))}
        </ol>

        {save.error && (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            className="flex-1"
            disabled={save.isPending || review.questions.length === 0}
            onClick={() =>
              save.mutate(
                {
                  subjectId: subject.id,
                  year: /^\d{4}$/.test(review.year.trim()) ? Number(review.year.trim()) : null,
                  examType: review.examType.trim() || null,
                  questions: review.questions,
                  promptVersion: review.promptVersion,
                },
                { onSuccess: onDone },
              )
            }
          >
            {save.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            Save paper
          </Button>
          <Button variant="outline" onClick={() => setReview(null)}>
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
