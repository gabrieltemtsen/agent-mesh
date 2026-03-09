/**
 * AgentMesh — OpenClaw Worker Runtime
 *
 * Each WorkerAgent is an autonomous AI agent that:
 *  1. Polls the task board for jobs matching its capabilities
 *  2. Claims the task (announces on Hedera HCS)
 *  3. Executes using Gemini AI (the real "brain")
 *  4. Reports completion → triggers HBAR payment on Hedera
 *
 * This is what makes AgentMesh "agent-native":
 * humans observe, agents work autonomously.
 */

import { executeTask } from "./gemini";
import {
  getAllTasks, getAllAgents, claimTask, completeTask,
  getAgent, getStats, seedIfNeeded, type Agent, type Task,
} from "@/lib/registry";
import { payAgent, postHcsMessage } from "@/lib/hedera";

// ── Worker log (ring buffer, 200 entries) ─────────────────────────────────────
export interface WorkerLogEntry {
  timestamp: string;
  agentId: string;
  agentName: string;
  level: "info" | "success" | "error" | "warn";
  message: string;
  taskId?: string;
}

const MAX_LOG = 200;
export const workerLog: WorkerLogEntry[] = [];

function wlog(agentId: string, agentName: string, level: WorkerLogEntry["level"], message: string, taskId?: string) {
  workerLog.unshift({ timestamp: new Date().toISOString(), agentId, agentName, level, message, taskId });
  if (workerLog.length > MAX_LOG) workerLog.length = MAX_LOG;
  const icon = level === "success" ? "✅" : level === "error" ? "❌" : level === "warn" ? "⚠️" : "🔵";
  console.log(`[AgentMesh Worker] ${icon} ${agentName}: ${message}`);
}

// ── Worker State ──────────────────────────────────────────────────────────────
interface WorkerState {
  agentId: string;
  running: boolean;
  pollIntervalMs: number;
  tasksExecuted: number;
  lastPollAt: string | null;
  lastTaskAt: string | null;
  currentTaskId: string | null;
}

const workerStates = new Map<string, WorkerState>();
let globalRunning = false;
let workerInitialized = false;

// ── Single Worker Loop ────────────────────────────────────────────────────────
async function runWorkerLoop(agent: Agent) {
  const state = workerStates.get(agent.id)!;

  while (state.running) {
    try {
      // Refresh agent from registry (status may have changed)
      const freshAgent = getAgent(agent.id);
      if (!freshAgent || freshAgent.status !== "idle") {
        await sleep(state.pollIntervalMs);
        continue;
      }

      state.lastPollAt = new Date().toISOString();

      // Scan task board for matching open tasks
      const tasks = getAllTasks().filter(
        (t) => t.status === "open" && freshAgent.capabilities.includes(t.capability)
      );

      if (tasks.length === 0) {
        await sleep(state.pollIntervalMs);
        continue;
      }

      // Pick highest reward task
      const task = tasks.sort((a, b) => b.reward - a.reward)[0];

      wlog(agent.id, agent.name, "info", `📋 Found task: "${task.title}" (${task.reward} ℏ)`, task.id);

      // Claim it
      const claimed = claimTask(task.id, agent.id);
      if (!claimed) {
        await sleep(2000);
        continue;
      }

      state.currentTaskId = task.id;
      state.lastTaskAt = new Date().toISOString();
      wlog(agent.id, agent.name, "info", `🔒 Claimed task — executing with Gemini AI...`, task.id);

      // Announce claim on HCS
      const topicId = process.env.HEDERA_TOPIC_ID;
      if (topicId) {
        postHcsMessage(topicId, {
          type: "TASK_CLAIMED",
          agentId: agent.id,
          agentName: agent.name,
          taskId: task.id,
          capability: task.capability,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }

      // ── EXECUTE WITH GEMINI ──
      let result: string;
      try {
        result = await executeTask(task.capability, task.title, task.description);
        wlog(agent.id, agent.name, "success",
          `🤖 Gemini execution complete (${result.length} chars output)`, task.id);
      } catch (err) {
        result = `[EXECUTION_ERROR] ${(err as Error).message}\n\nFallback: Task acknowledged and logged. Manual review required.`;
        wlog(agent.id, agent.name, "warn", `Gemini failed, using fallback result`, task.id);
      }

      // ── PAY HBAR ON HEDERA ──
      let paymentResult = null;
      const isRealAccount = freshAgent.accountId &&
        !["0.0.1001","0.0.1002","0.0.1003","0.0.OPERATOR","0.0.NEW"].includes(freshAgent.accountId);

      if (process.env.HEDERA_ACCOUNT_ID && isRealAccount) {
        try {
          paymentResult = await payAgent(
            freshAgent.accountId,
            task.reward,
            `AgentMesh: ${task.capability} task ${task.id.slice(0, 8)}`
          );
          wlog(agent.id, agent.name, "success",
            `💸 ${task.reward} ℏ paid on Hedera (tx: ${paymentResult.transactionId?.slice(0, 20)}...)`,
            task.id
          );
        } catch (e) {
          wlog(agent.id, agent.name, "warn",
            `HBAR payment skipped: ${(e as Error).message}`, task.id);
        }
      }

      // ── COMPLETE IN REGISTRY ──
      const completion = completeTask(task.id, agent.id, result, {
        onChain: !!paymentResult,
        transactionId: paymentResult?.transactionId,
      });

      if (completion) {
        state.tasksExecuted += 1;
        wlog(agent.id, agent.name, "success",
          `🎉 Task complete! Rep now: ${completion.agent.reputation} | Total earned: ${completion.agent.totalEarned} ℏ`,
          task.id
        );

        // Announce completion on HCS
        if (topicId) {
          postHcsMessage(topicId, {
            type: "TASK_COMPLETE",
            agentId: agent.id,
            agentName: agent.name,
            taskId: task.id,
            reward: task.reward,
            onChain: !!paymentResult,
            reputation: completion.agent.reputation,
            timestamp: new Date().toISOString(),
          }).catch(() => {});
        }
      }

      state.currentTaskId = null;

    } catch (err) {
      wlog(agent.id, agent.name, "error", `Worker loop error: ${(err as Error).message}`);
    }

    // Stagger poll intervals so agents don't all fire at once
    await sleep(state.pollIntervalMs + Math.random() * 5000);
  }

  wlog(agent.id, agent.name, "warn", "Worker stopped.");
}

// ── Start All Workers ─────────────────────────────────────────────────────────
export function startWorkers(): { started: number; agentIds: string[] } {
  if (workerInitialized) {
    return {
      started: workerStates.size,
      agentIds: Array.from(workerStates.keys()),
    };
  }

  seedIfNeeded();
  globalRunning = true;
  workerInitialized = true;

  const agents = getAllAgents();
  const started: string[] = [];

  for (const agent of agents) {
    if (workerStates.has(agent.id)) continue;

    const state: WorkerState = {
      agentId: agent.id,
      running: true,
      // Stagger poll intervals: 10-20s range per agent
      pollIntervalMs: 10000 + Math.random() * 10000,
      tasksExecuted: 0,
      lastPollAt: null,
      lastTaskAt: null,
      currentTaskId: null,
    };

    workerStates.set(agent.id, state);
    wlog(agent.id, agent.name, "info",
      `🚀 Worker started | caps: [${agent.capabilities.join(", ")}] | poll: ${Math.round(state.pollIntervalMs/1000)}s`
    );

    // Launch async loop (non-blocking)
    runWorkerLoop(agent).catch((e) =>
      wlog(agent.id, agent.name, "error", `Fatal: ${e.message}`)
    );

    started.push(agent.id);
  }

  return { started: started.length, agentIds: started };
}

// ── Worker Status ─────────────────────────────────────────────────────────────
export function getWorkerStatus() {
  const agents = getAllAgents();
  return {
    globalRunning,
    workerCount: workerStates.size,
    workers: agents.map((a) => {
      const s = workerStates.get(a.id);
      return {
        agentId: a.id,
        agentName: a.name,
        agentStatus: a.status,
        capabilities: a.capabilities,
        running: s?.running ?? false,
        pollIntervalMs: s?.pollIntervalMs ?? 0,
        tasksExecuted: s?.tasksExecuted ?? 0,
        lastPollAt: s?.lastPollAt ?? null,
        lastTaskAt: s?.lastTaskAt ?? null,
        currentTaskId: s?.currentTaskId ?? null,
        reputation: a.reputation,
        totalEarned: a.totalEarned,
      };
    }),
    stats: getStats(),
    recentLog: workerLog.slice(0, 30),
  };
}

// ── Stop All Workers ──────────────────────────────────────────────────────────
export function stopWorkers() {
  globalRunning = false;
  for (const [, state] of workerStates) {
    state.running = false;
  }
  workerStates.clear();
  workerInitialized = false;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
