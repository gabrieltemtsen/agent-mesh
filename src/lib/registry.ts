/**
 * AgentMesh – Agent Registry (singleton in-memory store)
 * Lives server-side; state persists across API calls within a single process
 */

import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

export type AgentType = "worker" | "broker";
export type AgentStatus = "idle" | "busy" | "offline";
export type TaskStatus = "open" | "claimed" | "in_progress" | "completed" | "failed";

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  capabilities: string[];
  accountId: string;
  description: string;
  reputation: number;
  tasksCompleted: number;
  totalEarned: number;
  status: AgentStatus;
  joinedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  capability: string;
  reward: number;
  requesterId: string;
  topicId: string | null;
  status: TaskStatus;
  claimedBy: string | null;
  completedAt: string | null;
  result?: string;
  resultHash?: string;
  createdAt: string;
}

export interface TxRecord {
  id: string;
  type: string;
  taskId: string;
  agentId: string;
  amount: number;
  timestamp: string;
  onChain?: boolean;
  transactionId?: string;
}

// ── Singleton store ──
const agents = new Map<string, Agent>();
const tasks = new Map<string, Task>();
const transactions: TxRecord[] = [];
let seeded = false;

// ── Agents ──
export function registerAgent(data: Omit<Agent, "id" | "reputation" | "tasksCompleted" | "totalEarned" | "status" | "joinedAt">): Agent {
  const agent: Agent = {
    id: uuidv4(),
    reputation: 100,
    tasksCompleted: 0,
    totalEarned: 0,
    status: "idle",
    joinedAt: new Date().toISOString(),
    ...data,
  };
  agents.set(agent.id, agent);
  return agent;
}

export const getAllAgents = () => Array.from(agents.values());
export const getAgent = (id: string) => agents.get(id);
export const findByCapability = (cap: string) =>
  Array.from(agents.values()).filter((a) => a.capabilities.includes(cap) && a.status === "idle");

// ── Tasks ──
export function createTask(data: {
  title: string;
  description: string;
  capability: string;
  reward: number;
  requesterId: string;
  topicId?: string;
}): Task {
  const task: Task = {
    id: uuidv4(),
    status: "open",
    claimedBy: null,
    completedAt: null,
    topicId: data.topicId ?? null,
    createdAt: new Date().toISOString(),
    ...data,
  };
  tasks.set(task.id, task);
  return task;
}

export function claimTask(taskId: string, agentId: string): Task | null {
  const task = tasks.get(taskId);
  const agent = agents.get(agentId);
  if (!task || task.status !== "open" || !agent || agent.status !== "idle") return null;
  task.status = "claimed";
  task.claimedBy = agentId;
  agent.status = "busy";
  return task;
}

export function completeTask(
  taskId: string,
  agentId: string,
  result: string,
  txRecord?: Partial<TxRecord>
): { task: Task; agent: Agent; transaction: TxRecord } | null {
  const task = tasks.get(taskId);
  const agent = agents.get(agentId);
  if (!task || task.status !== "claimed" || !agent) return null;

  task.status = "completed";
  task.completedAt = new Date().toISOString();
  task.result = result;
  task.resultHash = crypto.createHash("sha256").update(String(result ?? "")).digest("hex");
  agent.status = "idle";
  agent.tasksCompleted += 1;
  agent.totalEarned += task.reward;
  agent.reputation = Math.min(1000, agent.reputation + 5);

  const tx: TxRecord = {
    id: uuidv4(),
    type: "TASK_PAYMENT",
    taskId,
    agentId,
    amount: task.reward,
    timestamp: new Date().toISOString(),
    onChain: false,
    ...txRecord,
  };
  transactions.push(tx);

  return { task, agent, transaction: tx };
}

export const getAllTasks = () => Array.from(tasks.values());
export const getTask = (id: string) => tasks.get(id);
export const getTransactions = (limit = 20) => [...transactions].reverse().slice(0, limit);

// ── Stats ──
export function getStats() {
  const allAgents = getAllAgents();
  const allTasks = getAllTasks();
  return {
    totalAgents: allAgents.length,
    activeAgents: allAgents.filter((a) => a.status !== "offline").length,
    openTasks: allTasks.filter((t) => t.status === "open").length,
    completedTasks: allTasks.filter((t) => t.status === "completed").length,
    totalHbarTransacted: transactions.reduce((s, t) => s + t.amount, 0),
  };
}

// ── Seed ──
export function seedIfNeeded() {
  if (seeded) return;
  seeded = true;

  const workerAccountId = process.env.HEDERA_WORKER_ACCOUNT_ID ?? "0.0.8136877";
  const topicId = process.env.HEDERA_TOPIC_ID;

  // ── Register Agents ──
  const a1 = registerAgent({
    name: "ScriptWriter-7",
    type: "worker",
    capabilities: ["video_script", "content_writing"],
    accountId: workerAccountId,
    description: "Writes compelling video scripts & articles using Gemini AI",
  });
  const a2 = registerAgent({
    name: "DataAnalyst-4",
    type: "worker",
    capabilities: ["data_analysis", "reporting"],
    accountId: "0.0.8136880",
    description: "Runs structured data analysis and generates insight reports",
  });
  const a3 = registerAgent({
    name: "ImageForge-3",
    type: "worker",
    capabilities: ["image_generation", "thumbnail_design"],
    accountId: "0.0.8136881",
    description: "Generates scene images and thumbnails via FLUX / HuggingFace",
  });
  registerAgent({
    name: "CodeReviewer-2",
    type: "worker",
    capabilities: ["code_review", "security_audit"],
    accountId: "0.0.8136882",
    description: "Reviews code for bugs, security flaws, and performance issues",
  });
  const broker = registerAgent({
    name: "Orchestrator-Prime",
    type: "broker",
    capabilities: ["task_routing", "agent_coordination"],
    accountId: process.env.HEDERA_ACCOUNT_ID ?? "0.0.3849875",
    description: "Routes tasks to the best available worker agent on the mesh",
  });

  // ── Pre-seeded completed tasks (show demo activity on load) ──
  const t1 = createTask({
    title: "Write YouTube script: The Future of AI Agents",
    description: "7-min script covering autonomous agent networks, Hedera integration, and real-world use cases",
    capability: "video_script",
    reward: 2.5,
    requesterId: broker.id,
    topicId,
  });
  const t2 = createTask({
    title: "Analyze DeFi TVL trends Q1 2026",
    description: "Market analysis of top 10 DeFi protocols: TVL, volume, and growth vectors",
    capability: "data_analysis",
    reward: 3,
    requesterId: broker.id,
    topicId,
  });
  const t3 = createTask({
    title: "Generate hero images for AgentMesh landing page",
    description: "8 high-quality scene images: futuristic agents, neon tech aesthetic, dark background",
    capability: "image_generation",
    reward: 2,
    requesterId: broker.id,
    topicId,
  });

  // Complete t1 + t2 to show active demo state
  claimTask(t1.id, a1.id);
  completeTask(t1.id, a1.id,
    `[HOOK - 0:00]\nIn 2026, the most productive employee at your company won't be human.\nIt'll be an AI agent — running 24/7, billing in HBAR, and filing its own taxes.\n\n[INTRO - 0:15]\nWelcome to the agentic economy. Today we're breaking down exactly how autonomous agents like those on AgentMesh are changing work forever.\n\n[MAIN CONTENT - 0:35]\n▸ POINT 1: What makes an agent "autonomous"\n  Agents don't just generate — they plan, execute, and settle payments without a human in the loop.\n▸ POINT 2: Hedera as the coordination layer\n  Every task claim, execution, and payment is a verifiable HCS message. No trust required.\n▸ POINT 3: The HBAR micropayment model\n  Workers earn fractions of HBAR per task. At scale, this becomes a real economy.\n\n[OUTRO - 2:45]\nAgentMesh is live on Hedera testnet right now. Register your agent, post a task, and watch the mesh work.\nLink in description. Subscribe for more on the agentic economy.`,
    { onChain: true, transactionId: `0.0.3849875@${Date.now() - 120000}` }
  );

  claimTask(t2.id, a2.id);
  completeTask(t2.id, a2.id,
    `[DEFI MARKET ANALYSIS — Q1 2026]\n\n── KEY FINDINGS ──\n• Total DeFi TVL reached $98.4B (+31% QoQ) driven by restaking protocols\n• Hedera DeFi ecosystem grew 240% with SaucerSwap leading at $1.2B TVL\n• HBAR-denominated vaults outperformed ETH-denominated by 18% on risk-adjusted basis\n• Agent-automated yield strategies captured 12% of total protocol volume\n\n── TOP PROTOCOLS ──\n1. Aave v4      $22.1B TVL  (+8%)\n2. SaucerSwap   $1.2B  TVL  (+240%)\n3. EVM Liquidity $890M TVL  (+45%)\n\n── RECOMMENDATIONS ──\n• Allocate 15-20% to Hedera-native protocols (high growth, low competition)\n• Agent-automated DCA strategies show 23% better entry prices vs manual\n• Watch stablecoin yield on Hedera: averaging 8.2% APY with low smart contract risk\n\n── RISK FACTORS ──\n• Regulatory pressure on DeFi yields in EU (MiCA compliance costs)\n• Bridge security remains the #1 attack vector (4 exploits in Q1, $180M lost)\n\nConfidence score: 87% · Data sources: DefiLlama, CoinGecko, Hedera Mirror Node`,
    { onChain: true, transactionId: `0.0.3849875@${Date.now() - 60000}` }
  );

  // t3 is open (ready for workers to pick up in demo)
  // a3 is idle, ready

  // ── 2 more open tasks for workers to auto-claim ──
  createTask({
    title: "Write thread: Why AI agents need crypto rails",
    description: "10-tweet thread explaining why HBAR + HCS is the best foundation for agent payments",
    capability: "content_writing",
    reward: 1.5,
    requesterId: broker.id,
    topicId,
  });
  createTask({
    title: "Security audit: AgentMesh smart contract logic",
    description: "Review task claim/complete flow for race conditions, reentrancy, and payment exploits",
    capability: "code_review",
    reward: 4,
    requesterId: broker.id,
    topicId,
  });

  // Boost seeded agent reputation to look legit
  const freshA1 = agents.get(a1.id);
  if (freshA1) { freshA1.reputation = 285; freshA1.tasksCompleted = 37; freshA1.totalEarned = 89.5; }
  const freshA2 = agents.get(a2.id);
  if (freshA2) { freshA2.reputation = 210; freshA2.tasksCompleted = 21; freshA2.totalEarned = 63; }
  const freshA3 = agents.get(a3.id);
  if (freshA3) { freshA3.reputation = 175; freshA3.tasksCompleted = 14; freshA3.totalEarned = 28; }
}
