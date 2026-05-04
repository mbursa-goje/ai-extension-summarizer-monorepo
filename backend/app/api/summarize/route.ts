import { NextRequest } from "next/server";
import { generateText } from "ai";
import { openrouter, SUMMARIZE_MODEL } from "@/lib/ai";

export const runtime = "edge";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!text) {
    return Response.json(
      { error: "A non-empty text field is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured in the backend." },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  try {
    const result = await generateText({
      model: openrouter(SUMMARIZE_MODEL),
      system: `You are a concise article summarizer.
Return a structured summary using exactly these sections:
Summary:
- 3 to 5 bullet points, one sentence each.

Key insights:
- 2 to 3 bullet points explaining the most important ideas.

Estimated reading time:
- One short sentence using the article length.

Rules:
- Do not add opinions.
- Do not add a preamble or conclusion.
- Use plain text only.`,
      messages: [{ role: "user", content: text }],
      maxOutputTokens: 450,
    });

    const summary = result.text.trim();

    if (!summary) {
      return Response.json(
        { error: "The AI provider returned an empty summary." },
        { status: 502, headers: CORS_HEADERS },
      );
    }

    return new Response(summary, {
      headers: CORS_HEADERS,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The AI provider could not generate a summary.",
      },
      { status: 502, headers: CORS_HEADERS },
    );
  }
}
