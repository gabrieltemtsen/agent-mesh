import { NextResponse } from "next/server";
import { getAllAgents, getAllTasks, getTransactions, getStats, seedIfNeeded } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  seedIfNeeded();
  return NextResponse.json({
    stats: getStats(),
    agents: getAllAgents(),
    tasks: getAllTasks(),
    transactions: getTransactions(20),
    topicId: process.env.HEDERA_TOPIC_ID ?? null,
    network: process.env.HEDERA_NETWORK ?? "testnet",
  });
}
