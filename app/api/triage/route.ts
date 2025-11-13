import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { TRIAGE_PROMPT } from "../../../lib/prompts";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  const { description } = await req.json();

  const completion = await client.chat.completions.create({
    model: "llama3-70b-versatile",
    messages: [
      { role: "system", content: TRIAGE_PROMPT },
      { role: "user", content: description }
    ]
  });

  const content = completion.choices[0].message.content;

  try {
    return NextResponse.json(JSON.parse(content ?? "{}"));
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid JSON from AI", raw: content },
      { status: 500 }
    );
  }
}

