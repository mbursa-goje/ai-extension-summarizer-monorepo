import { NextRequest } from "next/server";
import { streamText } from "ai";
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

  const result = streamText({
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

  return result.toTextStreamResponse({
    headers: CORS_HEADERS,
  });
}
