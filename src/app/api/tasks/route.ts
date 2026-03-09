import { NextRequest, NextResponse } from "next/server";
import { getAllTasks, createTask, getAllAgents, seedIfNeeded } from "@/lib/registry";
import { postHcsMessage } from "@/lib/hedera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  seedIfNeeded();
  return NextResponse.json(getAllTasks());
}

export async function POST(req: NextRequest) {
  seedIfNeeded();
  try {
    const body = await req.json();
    const { title, description, capability, reward, requesterId } = body;

    const topicId = process.env.HEDERA_TOPIC_ID ?? null;
    let hcsStatus: string | null = null;

    if (topicId && process.env.HEDERA_ACCOUNT_ID) {
      try {
        hcsStatus = await postHcsMessage(topicId, {
          type: "NEW_TASK",
          title,
          capability,
          reward,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("HCS post failed:", (e as Error).message);
      }
    }

    // If requesterId not provided, default to broker
    let reqId = requesterId;
    if (!reqId) {
      const broker = getAllAgents().find((a) => a.type === "broker");
      reqId = broker?.id;
    }

    const task = createTask({ title, description, capability, reward, requesterId: reqId, topicId: topicId ?? undefined });
    return NextResponse.json({ ...task, hcsStatus });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
