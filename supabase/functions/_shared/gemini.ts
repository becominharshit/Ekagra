import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'

// Gemini models for Ekagra Studio's functions (studio-*), passed to createAiGateway as `model`.
// Kept apart from ai.ts so Ekagra's own functions, which use Claude only, don't bundle Google's SDK.
// A YouTube link in a prompt (a file part with the video's watch URL) goes to Gemini as it is: the
// provider knows YouTube URLs and doesn't download them.

export function geminiModels(apiKey: string): (modelId: string) => LanguageModel {
  const google = createGoogleGenerativeAI({ apiKey })
  return (modelId) => google(modelId)
}
