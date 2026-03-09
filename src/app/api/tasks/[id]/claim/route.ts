import { NextRequest, NextResponse } from "next/server";
import { claimTask, seedIfNeeded } from "@/lib/registry";
import { postHcsMessage } from "@/lib/hedera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  seedIfNeeded();
  try {
    const { id: taskId } = await params;
    const { agentId } = await req.json();
    const task = claimTask(taskId, agentId);
    if (!task) return NextResponse.json({ error: "Task unavailable or agent busy" }, { status: 400 });

    const topicId = process.env.HEDERA_TOPIC_ID;
    if (topicId) {
      postHcsMessage(topicId, { type: "TASK_CLAIMED", taskId, agentId, timestamp: new Date().toISOString() }).catch(() => {});
    }

    return NextResponse.json(task);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
