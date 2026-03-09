import { NextRequest, NextResponse } from "next/server";
import { getAllAgents, registerAgent, seedIfNeeded } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  seedIfNeeded();
  return NextResponse.json(getAllAgents());
}

export async function POST(req: NextRequest) {
  seedIfNeeded();
  try {
    const body = await req.json();
    const { name, type, capabilities, accountId, description } = body;
    if (!name || !capabilities?.length) {
      return NextResponse.json({ error: "name and capabilities required" }, { status: 400 });
    }
    const agent = registerAgent({
      name,
      type: type ?? "worker",
      capabilities: Array.isArray(capabilities)
        ? capabilities
        : capabilities.split(",").map((s: string) => s.trim()),
      accountId: accountId ?? "0.0.NEW",
      description: description ?? "",
    });
    return NextResponse.json(agent);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
