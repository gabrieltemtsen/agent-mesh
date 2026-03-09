/**
 * /api/workers — Start, stop, and monitor OpenClaw worker agents
 */

import { NextRequest, NextResponse } from "next/server";
import { startWorkers, stopWorkers, getWorkerStatus } from "@/lib/workers/runtime";
import { seedIfNeeded } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/workers — current worker status + log
export async function GET() {
  seedIfNeeded();
  return NextResponse.json(getWorkerStatus());
}

// POST /api/workers — { action: "start" | "stop" }
export async function POST(req: NextRequest) {
  try {
    seedIfNeeded();
    const { action } = await req.json();

    if (action === "start") {
      const result = startWorkers();
      return NextResponse.json({ ok: true, ...result, message: `${result.started} workers running` });
    }

    if (action === "stop") {
      stopWorkers();
      return NextResponse.json({ ok: true, message: "All workers stopped" });
    }

    return NextResponse.json({ error: "Invalid action. Use start or stop." }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
