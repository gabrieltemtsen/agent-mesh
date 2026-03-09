import { NextRequest, NextResponse } from "next/server";
import { createTaskTopic } from "@/lib/hedera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    topicId: process.env.HEDERA_TOPIC_ID ?? null,
    network: process.env.HEDERA_NETWORK ?? "testnet",
  });
}

export async function POST(req: NextRequest) {
  try {
    const { memo } = await req.json().catch(() => ({}));
    const topicId = await createTaskTopic(memo ?? "AgentMesh Task Board");
    return NextResponse.json({ topicId });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
