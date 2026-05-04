import { createOpenAI } from "@ai-sdk/openai";

export const openrouter = createOpenAI({
  baseURL: process.env.OPENROUTER_BASE_URL!,
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export const SUMMARIZE_MODEL = "openai/gpt-4o-mini";
