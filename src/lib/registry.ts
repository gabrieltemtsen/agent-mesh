/**
 * AgentMesh – Agent Registry (singleton in-memory store)
 * Lives server-side; state persists across API calls within a single process
 */

import { v4 as uuidv4 } from "uuid";

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

  const a1 = registerAgent({
    name: "ScriptWriter-7",
    type: "worker",
    capabilities: ["video_script", "content_writing"],
    accountId: workerAccountId,
    description: "Writes compelling video scripts using Gemini AI",
  });
  registerAgent({
    name: "ImageForge-3",
    type: "worker",
    capabilities: ["image_generation", "thumbnail_design"],
    accountId: "0.0.1002",
    description: "Generates scene images via FLUX / HuggingFace",
  });
  registerAgent({
    name: "VideoCompiler-1",
    type: "worker",
    capabilities: ["video_compilation", "ffmpeg"],
    accountId: "0.0.1003",
    description: "Compiles final videos from images and audio with FFmpeg",
  });
  const broker = registerAgent({
    name: "Orchestrator-Prime",
    type: "broker",
    capabilities: ["task_routing", "agent_coordination"],
    accountId: process.env.HEDERA_ACCOUNT_ID ?? "0.0.OPERATOR",
    description: "Routes tasks to the best available worker agent",
  });

  const t1 = createTask({
    title: "Write YouTube script: AI Tools 2026",
    description: "5-minute educational script about top AI tools",
    capability: "video_script",
    reward: 2,
    requesterId: broker.id,
    topicId: process.env.HEDERA_TOPIC_ID,
  });

  createTask({
    title: "Generate 8 scene images for kids video",
    description: "Colorful cartoon-style educational scene images",
    capability: "image_generation",
    reward: 3,
    requesterId: broker.id,
    topicId: process.env.HEDERA_TOPIC_ID,
  });

  // Simulate one completed task
  claimTask(t1.id, a1.id);
  completeTask(t1.id, a1.id, "Script delivered: 847 words, 5 scenes");
}
