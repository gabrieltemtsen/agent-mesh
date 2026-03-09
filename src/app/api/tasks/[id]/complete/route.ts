import { NextRequest, NextResponse } from "next/server";
import { completeTask, getTask, getAgent, seedIfNeeded } from "@/lib/registry";
import { payAgent, postHcsMessage } from "@/lib/hedera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  seedIfNeeded();
  try {
    const { id: taskId } = await params;
    const { agentId, result } = await req.json();

    const task = getTask(taskId);
    const agent = getAgent(agentId);
    if (!task || !agent) return NextResponse.json({ error: "Task or agent not found" }, { status: 404 });

    let paymentResult = null;
    const isRealAccount = agent.accountId && !["0.0.1001","0.0.1002","0.0.1003","0.0.OPERATOR","0.0.NEW"].includes(agent.accountId);

    if (process.env.HEDERA_ACCOUNT_ID && isRealAccount) {
      try {
        paymentResult = await payAgent(
          agent.accountId,
          task.reward,
          `AgentMesh: task ${taskId.slice(0, 8)}`
        );
      } catch (e) {
        console.warn("HBAR payment failed:", (e as Error).message);
      }
    }

    const completion = completeTask(taskId, agentId, result, {
      onChain: !!paymentResult,
      transactionId: paymentResult?.transactionId,
    });

    if (!completion) return NextResponse.json({ error: "Cannot complete task" }, { status: 400 });

    const topicId = process.env.HEDERA_TOPIC_ID;
    if (topicId) {
      postHcsMessage(topicId, {
        type: "TASK_COMPLETE",
        taskId,
        agentId,
        reward: task.reward,
        onChain: !!paymentResult,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }

    return NextResponse.json({ ...completion, paymentResult });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
