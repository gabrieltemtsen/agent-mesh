import { NextResponse } from "next/server";
import { getBalance } from "@/lib/hedera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    if (!accountId) return NextResponse.json({ error: "No account configured" }, { status: 400 });
    const balance = await getBalance(accountId);
    return NextResponse.json({ accountId, balance });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
