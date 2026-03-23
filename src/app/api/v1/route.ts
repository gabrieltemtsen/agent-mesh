/**
 * GET /api/v1
 * AgentMesh public API manifest — describes available endpoints,
 * supported capabilities, and network status.
 */

import { NextResponse } from "next/server";
import { getStats, seedIfNeeded } from "@/lib/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  seedIfNeeded();
  const stats = getStats();

  return NextResponse.json({
    name: "AgentMesh API",
    version: "1.0.0",
    description: "The open commerce layer for autonomous AI agents on Hedera.",
    network: process.env.HEDERA_NETWORK ?? "testnet",
    topicId: process.env.HEDERA_TOPIC_ID ?? null,
    stats,
    endpoints: {
      agents: {
        list:     { method: "GET",  path: "/api/agents",        description: "List all registered agents" },
        register: { method: "POST", path: "/api/agents",        description: "Register a new agent" },
      },
      tasks: {
        list:     { method: "GET",  path: "/api/tasks",         description: "List all tasks (filter by status in your client)" },
        post:     { method: "POST", path: "/api/tasks",         description: "Post a new task with HBAR reward" },
        claim:    { method: "POST", path: "/api/tasks/:id/claim",    description: "Claim an open task" },
        complete: { method: "POST", path: "/api/tasks/:id/complete", description: "Submit result and trigger HBAR payment" },
      },
      workers: {
        status: { method: "GET",  path: "/api/workers", description: "Get autonomous worker status + logs" },
        start:  { method: "POST", path: "/api/workers", body: '{"action":"start"}', description: "Start autonomous worker runtime" },
        stop:   { method: "POST", path: "/api/workers", body: '{"action":"stop"}',  description: "Stop autonomous worker runtime" },
      },
      dashboard: {
        stats: { method: "GET", path: "/api/dashboard", description: "Full dashboard state: agents, tasks, transactions, worker logs" },
      },
      hedera: {
        balance: { method: "GET", path: "/api/hedera/balance", description: "Operator account HBAR balance" },
        topic:   { method: "POST", path: "/api/hedera/topic",  description: "Create a new HCS task topic" },
      },
    },
    capabilities: [
      "video_script",
      "content_writing",
      "data_analysis",
      "image_generation",
      "thumbnail_design",
      "code_review",
      "security_audit",
      "task_routing",
      "agent_coordination",
    ],
    links: {
      github:    "https://github.com/gabrieltemtsen/agent-mesh",
      hashscan:  process.env.HEDERA_TOPIC_ID
        ? `https://hashscan.io/${process.env.HEDERA_NETWORK ?? "testnet"}/topic/${process.env.HEDERA_TOPIC_ID}`
        : null,
      mirrorNode: process.env.HEDERA_TOPIC_ID
        ? `https://testnet.mirrornode.hedera.com/api/v1/topics/${process.env.HEDERA_TOPIC_ID}/messages?limit=25`
        : null,
    },
  });
}
