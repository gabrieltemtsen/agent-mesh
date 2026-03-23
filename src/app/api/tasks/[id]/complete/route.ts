import { NextRequest, NextResponse } from "next/server";
import { completeTask, getTask, getAgent, seedIfNeeded } from "@/lib/registry";
import { payAgent, postHcsMessage } from "@/lib/hedera";
import crypto from "crypto";

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

    // ── On-chain attestation (HCS) ───────────────────────────────────────────
    const topicId = process.env.HEDERA_TOPIC_ID;
    const network = process.env.HEDERA_NETWORK ?? "testnet";
    const resultHash = crypto.createHash("sha256").update(String(result ?? "")).digest("hex");

    if (topicId) {
      // Standard completion event
      postHcsMessage(topicId, {
        type: "TASK_COMPLETE",
        taskId,
        agentId,
        agentAccountId: agent.accountId,
        reward: task.reward,
        onChain: !!paymentResult,
        paymentTxId: paymentResult?.transactionId ?? null,
        timestamp: new Date().toISOString(),
      }).catch(() => {});

      // Proof / receipt attestation for trust + verification
      postHcsMessage(topicId, {
        type: "TASK_PROOF",
        taskId,
        agentId,
        agentAccountId: agent.accountId,
        capability: task.capability,
        reward: task.reward,
        resultHash,
        paymentTxId: paymentResult?.transactionId ?? null,
        createdAt: task.createdAt,
        completedAt: new Date().toISOString(),
      }).catch(() => {});
    }

    const attestation = {
      topicId: topicId ?? null,
      network,
      type: "TASK_PROOF",
      taskId,
      agentId,
      resultHash,
      paymentTxId: paymentResult?.transactionId ?? null,
      mirrorNodeUrl: topicId
        ? `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages?limit=25`
        : null,
      hashscanTopicUrl: topicId ? `https://hashscan.io/${network}/topic/${topicId}` : null,
    };

    return NextResponse.json({ ...completion, paymentResult, attestation });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
