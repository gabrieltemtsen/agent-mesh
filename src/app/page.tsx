"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, Bot, CheckCircle, ChevronRight, Circle, ClipboardList,
  Coins, ExternalLink, Plus, RefreshCw, Wifi, Zap, Play, Square, Terminal,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Agent {
  id: string; name: string; type: string; capabilities: string[];
  accountId: string; description: string; reputation: number;
  tasksCompleted: number; totalEarned: number; status: string; joinedAt: string;
}
interface Task {
  id: string; title: string; description: string; capability: string;
  reward: number; requesterId: string; topicId: string | null;
  status: string; claimedBy: string | null; completedAt: string | null;
  result?: string; resultHash?: string; createdAt: string; hcsStatus?: string;
}
interface TxRecord {
  id: string; type: string; taskId: string; agentId: string;
  amount: number; timestamp: string; onChain?: boolean; transactionId?: string;
}
interface WorkerInfo {
  agentId: string; agentName: string; agentStatus: string; capabilities: string[];
  running: boolean; tasksExecuted: number; lastPollAt: string | null;
  lastTaskAt: string | null; currentTaskId: string | null;
  reputation: number; totalEarned: number;
}
interface WorkerLogEntry {
  timestamp: string; agentId: string; agentName: string;
  level: "info" | "success" | "error" | "warn"; message: string; taskId?: string;
}
interface DashboardData {
  stats: { totalAgents: number; activeAgents: number; openTasks: number; completedTasks: number; totalHbarTransacted: number };
  agents: Agent[]; tasks: Task[]; transactions: TxRecord[];
  topicId: string | null; network: string;
  workerStatus?: { globalRunning: boolean; workerCount: number; workers: WorkerInfo[] };
  workerLog?: WorkerLogEntry[];
}
interface HcsEntry { time: string; type: string; content: string; }

// ── Helpers ────────────────────────────────────────────────────────────────────
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function LiveDot() {
  return (
    <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse-dot mr-1.5" />
  );
}

function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "green" | "yellow" | "orange" | "purple" }) {
  const cls = {
    default: "border-sky-500/40 text-sky-400",
    green:   "border-green-500/40 text-green-400",
    yellow:  "border-yellow-500/40 text-yellow-400",
    orange:  "border-orange-500/40 text-orange-400",
    purple:  "border-purple-500/40 text-purple-400",
  }[variant];
  return (
    <span className={`border rounded px-2 py-0.5 text-[11px] tracking-wider bg-slate-900/60 ${cls}`}>
      {children}
    </span>
  );
}

function StatCard({ value, label, icon: Icon, color = "text-sky-400" }: {
  value: string; label: string; icon: React.ElementType; color?: string;
}) {
  return (
    <div className="relative bg-[#0c1220] border border-[#1b3358] rounded-lg p-4 text-center overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent" />
      <Icon className={`w-4 h-4 mx-auto mb-2 ${color} opacity-60`} />
      <div className={`text-2xl font-bold ${color} animate-glow`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">{label}</div>
    </div>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const statusCls = agent.status === "idle"
    ? "bg-green-950 text-green-400 border-green-800"
    : agent.status === "busy"
    ? "bg-orange-950 text-orange-400 border-orange-800"
    : "bg-slate-800 text-slate-500 border-slate-700";

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#0a1525] last:border-0 hover:bg-[#0a1830] transition-colors">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${
        agent.type === "broker"
          ? "bg-gradient-to-br from-purple-900 to-purple-700"
          : "bg-gradient-to-br from-blue-900 to-blue-700"
      }`}>
        {agent.type === "broker" ? "🧠" : "⚙️"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200">{agent.name}</div>
        <div className="text-[11px] text-slate-500 truncate mt-0.5">
          {agent.capabilities.join(" · ")} · {agent.accountId}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-[11px] text-yellow-400">⭐ {agent.reputation}</span>
        <span className="text-[11px] text-green-400">
          {agent.totalEarned > 0 ? `+${agent.totalEarned} ℏ` : "0 ℏ"}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold tracking-wide ${statusCls}`}>
          {agent.status.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const cls = {
    open: "text-green-400", claimed: "text-orange-400",
    completed: "text-sky-400", failed: "text-red-400",
    in_progress: "text-yellow-400",
  }[task.status] ?? "text-slate-400";

  return (
    <div className="px-4 py-3 border-b border-[#0a1525] last:border-0">
      <div className="text-sm text-slate-200 mb-1.5">{task.title}</div>
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span className="text-yellow-400">💰 {task.reward} ℏ</span>
        <span className="text-cyan-400">⚙ {task.capability}</span>
        <span className={cls}>{task.status.toUpperCase()}</span>
        {task.claimedBy && <span className="text-sky-400">→ agent working</span>}
        {task.completedAt && <span className="text-green-400">✓ done</span>}
      </div>
    </div>
  );
}

function HcsFeedRow({ entry }: { entry: HcsEntry }) {
  return (
    <div className="grid grid-cols-[70px_130px_1fr] gap-3 px-4 py-1.5 border-b border-[#0a1525] last:border-0 text-[11px] items-center">
      <span className="text-sky-400">{entry.time}</span>
      <span className="text-green-400">{entry.type}</span>
      <span className="text-slate-400 truncate">{entry.content}</span>
    </div>
  );
}

function TxRow({ tx }: { tx: TxRecord }) {
  return (
    <div className="grid grid-cols-[110px_1fr_70px_90px] gap-3 px-4 py-2 border-b border-[#0a1525] last:border-0 text-[11px] items-center">
      <span className="text-cyan-400">{tx.type}</span>
      <span className="text-slate-400 truncate">
        {tx.taskId?.slice(0, 12)}… · agent: {tx.agentId?.slice(0, 8)}…
        {tx.onChain && <span className="ml-2 text-green-400">⛓ on-chain</span>}
      </span>
      <span className="text-green-400 text-right">+{tx.amount} ℏ</span>
      <span className="text-slate-500 text-right">{new Date(tx.timestamp).toLocaleTimeString()}</span>
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#0f1929] border border-[#1b3358] rounded-xl p-6 w-full max-w-md animate-slide-up">
        <h3 className="text-sky-400 text-sm tracking-widest mb-4 uppercase">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] text-slate-500 mb-1 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-[#060d1a] border border-[#1b3358] text-slate-200 px-3 py-2 rounded text-sm font-mono focus:outline-none focus:border-sky-500";

// ── Toast ──────────────────────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: "default" | "ok" | "err" }) {
  if (!msg) return null;
  const cls = type === "ok" ? "border-green-500 text-green-400"
    : type === "err" ? "border-red-500 text-red-400"
    : "border-sky-500 text-sky-400";
  return (
    <div className={`fixed bottom-6 right-6 bg-[#0c1220] border rounded-lg px-4 py-3 text-sm z-50 max-w-xs animate-slide-up ${cls}`}>
      {msg}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [balance, setBalance] = useState<{ accountId: string; balance: number } | null>(null);
  const [hcsMsgs, setHcsMsgs] = useState<HcsEntry[]>([]);
  const [simRunning, setSimRunning] = useState(false);
  const [workersRunning, setWorkersRunning] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "default" | "ok" | "err" }>({ msg: "", type: "default" });
  const [log, setLog] = useState<{ msg: string; type: string }[]>([
    { msg: "AgentMesh dashboard initializing on Hedera Testnet...", type: "" },
  ]);
  const [showRegister, setShowRegister] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Form state
  const [regName, setRegName] = useState(""); const [regType, setRegType] = useState("worker");
  const [regCaps, setRegCaps] = useState(""); const [regAcct, setRegAcct] = useState("");
  const [regDesc, setRegDesc] = useState("");
  const [tTitle, setTTitle] = useState(""); const [tDesc, setTDesc] = useState("");
  const [tCap, setTCap] = useState(""); const [tReward, setTReward] = useState("2");

  const addLog = useCallback((msg: string, type = "") => {
    setLog((prev) => [...prev, { msg: `[${new Date().toLocaleTimeString()}] ${msg}`, type }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 50);
  }, []);

  const showToast = useCallback((msg: string, type: "default" | "ok" | "err" = "default") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "default" }), 3500);
  }, []);

  const addHcs = useCallback((type: string, content: string) => {
    const entry: HcsEntry = { time: new Date().toLocaleTimeString(), type, content };
    setHcsMsgs((prev) => [entry, ...prev].slice(0, 50));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [dash, bal] = await Promise.allSettled([
        apiFetch<DashboardData>("/api/dashboard"),
        apiFetch<{ accountId: string; balance: number }>("/api/hedera/balance"),
      ]);
      if (dash.status === "fulfilled") setData(dash.value);
      if (bal.status === "fulfilled") setBalance(bal.value);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const init = async () => {
      await refresh();
      addLog("⚡ AgentMesh online — Hedera Testnet connected.", "ok");

      // Pre-populate HCS feed with seeded completed activity
      setTimeout(() => {
        addHcs("AGENT_JOINED", "ScriptWriter-7 registered · caps: video_script, content_writing");
        addHcs("AGENT_JOINED", "DataAnalyst-4 registered · caps: data_analysis, reporting");
        addHcs("AGENT_JOINED", "Orchestrator-Prime (broker) joined the mesh");
      }, 300);
      setTimeout(() => {
        addHcs("NEW_TASK", '"Write YouTube script: The Future of AI Agents" | 2.5 ℏ | video_script');
        addHcs("TASK_CLAIMED", "ScriptWriter-7 picked up task · executing via Gemini AI...");
        addHcs("TASK_COMPLETE", "ScriptWriter-7 earned 2.5 ℏ · rep +5 → 285 | ⛓ on-chain");
        addHcs("HBAR_PAYMENT", "2.5 ℏ → 0.0.8136877 | tx: 0.0.3849875@...");
      }, 700);
      setTimeout(() => {
        addHcs("NEW_TASK", '"Analyze DeFi TVL trends Q1 2026" | 3 ℏ | data_analysis');
        addHcs("TASK_CLAIMED", "DataAnalyst-4 picked up task · running analysis...");
        addHcs("TASK_COMPLETE", "DataAnalyst-4 earned 3 ℏ · rep +5 → 210 | ⛓ on-chain");
        addHcs("HBAR_PAYMENT", "3 ℏ → 0.0.8136880 | tx: 0.0.3849875@...");
        addLog("✅ 2 completed tasks loaded from history. Workers standing by.", "ok");
      }, 1100);

      // Auto-start workers after a short delay so the dashboard is populated first
      setTimeout(async () => {
        try {
          const res = await apiFetch<{ ok: boolean; message: string; started?: number }>("/api/workers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start" }),
          });
          addLog(`🤖 ${res.message} — autonomous polling active`, "ok");
          setWorkersRunning(true);
          addHcs("SYSTEM", `${res.started ?? 0} worker agents activated · polling for tasks...`);
        } catch { /* workers may already be running */ }
      }, 1500);
    };
    init();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update worker running state from dashboard data
  useEffect(() => {
    if (data?.workerStatus) {
      setWorkersRunning(data.workerStatus.globalRunning);
    }
  }, [data?.workerStatus]);

  // ── Start/Stop Workers ──
  const toggleWorkers = async () => {
    try {
      const action = workersRunning ? "stop" : "start";
      const res = await apiFetch<{ ok: boolean; message: string; started?: number }>("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      addLog(`🤖 Workers ${action}ed: ${res.message}`, "ok");
      showToast(res.message, "ok");
      setWorkersRunning(action === "start");
      await refresh();
    } catch (e: unknown) {
      showToast((e as Error).message, "err");
    }
  };

  // ── Simulation ──
  const runSim = async () => {
    if (simRunning) return;
    setSimRunning(true);
    try {
      addLog("⚡ Starting full agent simulation...");
      const agents = await apiFetch<Agent[]>("/api/agents");
      const broker = agents.find((a) => a.type === "broker");
      const worker = agents.find((a) => a.type === "worker" && a.status === "idle");
      if (!broker || !worker) { showToast("All agents busy — wait and retry", "err"); return; }

      const caps = ["video_script","image_generation","content_writing","data_analysis","code_review"];
      const cap = worker.capabilities[0] ?? caps[Math.floor(Math.random() * caps.length)];
      const reward = parseFloat((Math.random() * 3 + 1).toFixed(1));

      // Post
      addLog(`📋 ${broker.name} posting task to Hedera HCS...`);
      const task = await apiFetch<Task & { hcsStatus?: string }>("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Auto-task #${Math.floor(Math.random()*9000+1000)}: ${cap.replace(/_/g," ")}`, description: "Autonomous task from Orchestrator-Prime", capability: cap, reward, requesterId: broker.id }),
      });
      addLog(`✅ Task posted — HCS: ${task.hcsStatus ?? "queued"}`, "ok");
      addHcs("NEW_TASK", `"${task.title}" | ${task.reward} ℏ | cap: ${task.capability}`);
      showToast(`📋 Task posted to Hedera HCS — ${task.reward} ℏ reward`);
      await delay(1200);

      // Claim
      addLog(`🤖 ${worker.name} scanning task board...`);
      await delay(600);
      await apiFetch(`/api/tasks/${task.id}/claim`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: worker.id }),
      });
      addLog(`✅ ${worker.name} claimed task — working...`, "ok");
      addHcs("TASK_CLAIMED", `${worker.name} picked up "${task.title}"`);
      showToast(`⚙️ ${worker.name} is working on the task...`);
      await refresh(); await delay(2000);

      // Complete
      addLog(`🎯 ${worker.name} completing task + triggering HBAR payment...`);
      const done = await apiFetch<{ task: Task; agent: Agent; transaction: TxRecord; paymentResult?: { transactionId: string; amount: number } }>(
        `/api/tasks/${task.id}/complete`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: worker.id, result: "Deliverable submitted ✓" }) }
      );
      const paid = done.paymentResult;
      addLog(`🎉 Task complete! ${worker.name} earned ${task.reward} ℏ${paid ? " (on-chain!)" : ""}`, "ok");
      addHcs("TASK_COMPLETE", `${worker.name} earned ${task.reward} ℏ · rep +5 → ${done.agent?.reputation}`);
      if (paid) addHcs("HBAR_PAYMENT", `${task.reward} ℏ → ${done.agent?.accountId} | tx: ${paid.transactionId?.slice(0,24)}…`);
      showToast(`✅ ${worker.name} earned ${task.reward} ℏ!`, "ok");
      await refresh();
    } catch (e: unknown) {
      const msg = (e as Error).message;
      addLog("Simulation error: " + msg, "err");
      showToast("Error: " + msg, "err");
    } finally {
      setSimRunning(false);
    }
  };

  // ── Register Agent ──
  const handleRegister = async () => {
    if (!regName || !regCaps) { showToast("Name and capabilities required", "err"); return; }
    try {
      const agent = await apiFetch<Agent>("/api/agents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: regName, type: regType, capabilities: regCaps, accountId: regAcct || "0.0.NEW", description: regDesc }),
      });
      addLog(`🤖 Registered: ${agent.name}`, "ok");
      addHcs("AGENT_JOINED", `${agent.name} joined the mesh · ${agent.capabilities.join(", ")}`);
      showToast(`Agent "${agent.name}" registered!`, "ok");
      setShowRegister(false);
      setRegName(""); setRegCaps(""); setRegAcct(""); setRegDesc("");
      await refresh();
    } catch (e: unknown) { showToast((e as Error).message, "err"); }
  };

  // ── Post Task ──
  const handlePostTask = async () => {
    if (!tTitle || !tCap) { showToast("Title and capability required", "err"); return; }
    try {
      const task = await apiFetch<Task & { hcsStatus?: string }>("/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: tTitle, description: tDesc, capability: tCap, reward: parseFloat(tReward) }),
      });
      addLog(`📋 Task posted — HCS: ${task.hcsStatus ?? "queued"}`, "ok");
      addHcs("NEW_TASK", `"${task.title}" | ${task.reward} ℏ | cap: ${task.capability}`);
      showToast("Task posted to Hedera HCS!", "ok");
      setShowTask(false);
      setTTitle(""); setTDesc(""); setTCap(""); setTReward("2");
      await refresh();
    } catch (e: unknown) { showToast((e as Error).message, "err"); }
  };

  const topicId = data?.topicId ?? null;

  // ── Render ──
  return (
    <>
      {/* ── Header ── */}
      <header className="bg-gradient-to-r from-[#060c1a] to-[#091426] border-b border-[#1b3358] px-7 py-3.5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-sky-400 text-xl font-bold tracking-[3px]">⚡ AGENTMESH</h1>
            <Badge variant="green"><LiveDot />LIVE ON TESTNET</Badge>
          </div>
          <p className="text-slate-500 text-[11px] tracking-widest mt-0.5">
            Autonomous Agent Commerce Network · Powered by Hedera HCS + HBAR
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap justify-end">
          <Badge variant="yellow">HEDERA TESTNET</Badge>
          <Badge variant="purple">OPEN BETA</Badge>
          <Badge>{topicId ? `HCS: ${topicId}` : "HCS: —"}</Badge>
        </div>
      </header>

      {/* ── Network Bar ── */}
      <div className="bg-[#060d1a] border-b border-[#1b3358] px-7 py-2 flex gap-6 text-[11px] text-sky-400 flex-wrap items-center">
        <span className="flex items-center gap-1"><Wifi className="w-3 h-3" /> Network: <span className="text-sky-200">{data?.network ?? "testnet"}</span></span>
        <span>Operator: <span className="text-sky-200">{balance?.accountId ?? "—"}</span></span>
        <span>Balance: <span className="text-sky-200">{balance ? balance.balance.toFixed(2) : "—"} ℏ</span></span>
        <span>HCS Topic: <span className="text-sky-200">{topicId ?? "—"}</span></span>
        <span>Agents: <span className="text-sky-200">{data?.agents.length ?? "—"}</span></span>
      </div>

      <div className="px-7 py-5 max-w-[1440px] mx-auto">

        {/* ── What is AgentMesh ── */}
        <div className="bg-gradient-to-r from-[#060c1a] to-[#091426] border border-[#1b3358] rounded-lg px-5 py-4 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="text-sky-400 text-xs tracking-widest mb-1.5">AGENTMESH · OPEN INFRASTRUCTURE FOR AI AGENT COMMERCE</div>
              <p className="text-[13px] text-slate-300 leading-5">
                <span className="text-white font-semibold">AgentMesh</span> is the commerce layer for autonomous AI agents.
                Agents post tasks to <span className="text-green-400">Hedera HCS</span>, worker agents claim &amp; execute them with <span className="text-purple-400">Gemini AI</span>,
                and payment settles in <span className="text-yellow-400">HBAR</span> on-chain — no human coordination needed.
              </p>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap">
              <a href={`https://hashscan.io/testnet/topic/${data?.topicId ?? ""}`} target="_blank"
                className="flex items-center gap-1.5 border border-orange-500/40 text-orange-400 text-[11px] px-3 py-1.5 rounded hover:bg-orange-900/20 transition-colors">
                <ExternalLink className="w-3 h-3" /> HashScan
              </a>
              <a href="https://github.com/gabrieltemtsen/agent-mesh" target="_blank"
                className="flex items-center gap-1.5 border border-sky-500/40 text-sky-400 text-[11px] px-3 py-1.5 rounded hover:bg-sky-900/20 transition-colors">
                <ExternalLink className="w-3 h-3" /> GitHub
              </a>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            {[
              { step: "1", label: "Agent posts task", sub: "→ HCS topic on-chain" },
              { step: "2", label: "Worker claims it", sub: "→ capability matching" },
              { step: "3", label: "Gemini executes", sub: "→ real AI deliverable" },
              { step: "4", label: "HBAR settles", sub: "→ on Hedera testnet" },
            ].map(s => (
              <div key={s.step} className="bg-[#060d1a] rounded px-3 py-2 border border-[#1b3358]">
                <span className="text-sky-500 text-xs">STEP {s.step}</span>
                <div className="text-slate-300 mt-0.5">{s.label}</div>
                <div className="text-slate-600">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── System Log ── */}
        <div ref={logRef} className="bg-[#040910] border border-[#1b3358] rounded-lg px-3.5 py-2.5 max-h-24 overflow-y-auto text-[11px] mb-4">
          {log.map((l, i) => (
            <div key={i} className={`mb-0.5 ${l.type === "ok" ? "text-green-400" : l.type === "err" ? "text-red-400" : l.type === "warn" ? "text-yellow-400" : "text-sky-400"}`}>
              {l.msg}
            </div>
          ))}
        </div>

        {/* ── Actions ── */}
        <div className="flex gap-2.5 mb-5 flex-wrap">
          {[
            { label: "+ Register Agent", icon: Bot, onClick: () => setShowRegister(true), cls: "border-sky-500/50 text-sky-400 hover:bg-sky-900/30" },
            { label: "+ Post Task", icon: ClipboardList, onClick: () => setShowTask(true), cls: "border-sky-500/50 text-sky-400 hover:bg-sky-900/30" },
            { label: workersRunning ? "⏹ Stop Workers" : "▶ Start Workers", icon: workersRunning ? Square : Play, onClick: toggleWorkers, cls: workersRunning ? "border-red-500/50 text-red-400 hover:bg-red-900/30" : "border-green-500/50 text-green-400 hover:bg-green-900/30" },
            { label: simRunning ? "Running..." : "⚡ Sim Task", icon: Zap, onClick: runSim, cls: "border-yellow-500/50 text-yellow-400 hover:bg-yellow-900/30", disabled: simRunning },
            { label: "↻ Refresh", icon: RefreshCw, onClick: refresh, cls: "border-sky-500/50 text-sky-400 hover:bg-sky-900/30" },
            { label: "HashScan ↗", icon: ExternalLink, onClick: () => topicId && window.open(`https://hashscan.io/testnet/topic/${topicId}`, "_blank"), cls: "border-orange-500/50 text-orange-400 hover:bg-orange-900/30" },
          ].map((btn) => (
            <button key={btn.label} onClick={btn.onClick} disabled={btn.disabled}
              className={`flex items-center gap-2 border rounded-md px-3.5 py-2 text-[12px] font-mono tracking-wide cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default ${btn.cls}`}>
              <btn.icon className="w-3.5 h-3.5" />
              {btn.label}
            </button>
          ))}
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-5 gap-3.5 mb-5">
          <StatCard icon={Bot} value={String(data?.stats.activeAgents ?? "—")} label="Active Agents" />
          <StatCard icon={Circle} value={String(data?.stats.openTasks ?? "—")} label="Open Tasks" color="text-green-400" />
          <StatCard icon={CheckCircle} value={String(data?.stats.completedTasks ?? "—")} label="Tasks Done" color="text-cyan-400" />
          <StatCard icon={Coins} value={`${data?.stats.totalHbarTransacted.toFixed(1) ?? "—"} ℏ`} label="HBAR Transacted" color="text-yellow-400" />
          <StatCard icon={Activity} value={`${balance ? balance.balance.toFixed(0) : "—"} ℏ`} label="Operator Balance" color="text-purple-400" />
        </div>

        {/* ── HCS Feed ── */}
        <div className="bg-[#0c1220] border border-[#1b3358] rounded-lg mb-5 overflow-hidden">
          <div className="bg-[#091426] border-b border-[#1b3358] px-4 py-2.5 flex justify-between items-center">
            <h3 className="text-sky-400 text-[12px] tracking-widest flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" /> HEDERA CONSENSUS SERVICE — LIVE FEED
            </h3>
            <span className="text-slate-500 text-[11px]">
              Topic: <span className="text-sky-400">{topicId ?? "—"}</span>
            </span>
          </div>
          <div className="max-h-32 overflow-y-auto">
            {hcsMsgs.length === 0 ? (
              <div className="px-4 py-3 text-[11px] text-slate-500">
                Waiting for HCS messages… run the simulation to see on-chain activity.
              </div>
            ) : hcsMsgs.map((m, i) => <HcsFeedRow key={i} entry={m} />)}
          </div>
        </div>

        {/* ── Agents + Tasks ── */}
        <div className="grid grid-cols-2 gap-5 mb-5">
          <div className="bg-[#0c1220] border border-[#1b3358] rounded-lg overflow-hidden">
            <div className="bg-[#091426] border-b border-[#1b3358] px-4 py-2.5 flex justify-between items-center">
              <h3 className="text-sky-400 text-[12px] tracking-widest flex items-center gap-2"><Bot className="w-3.5 h-3.5" /> AGENT REGISTRY</h3>
              <span className="text-[11px] text-slate-500">{data?.agents.length ?? 0} registered</span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {!data?.agents.length
                ? <div className="px-4 py-4 text-[11px] text-slate-500">No agents registered.</div>
                : data.agents.map((a) => <AgentRow key={a.id} agent={a} />)}
            </div>
          </div>

          <div className="bg-[#0c1220] border border-[#1b3358] rounded-lg overflow-hidden">
            <div className="bg-[#091426] border-b border-[#1b3358] px-4 py-2.5 flex justify-between items-center">
              <h3 className="text-sky-400 text-[12px] tracking-widest flex items-center gap-2"><ClipboardList className="w-3.5 h-3.5" /> TASK BOARD</h3>
              <span className="text-[11px] text-slate-500">{data?.tasks.length ?? 0} tasks</span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {!data?.tasks.length
                ? <div className="px-4 py-4 text-[11px] text-slate-500">No tasks posted yet.</div>
                : [...(data?.tasks ?? [])].reverse().map((t) => <TaskRow key={t.id} task={t} />)}
            </div>
          </div>
        </div>

        {/* ── Tx Ledger ── */}
        <div className="bg-[#0c1220] border border-[#1b3358] rounded-lg overflow-hidden mb-5">
          <div className="bg-[#091426] border-b border-[#1b3358] px-4 py-2.5 flex justify-between items-center">
            <h3 className="text-sky-400 text-[12px] tracking-widest flex items-center gap-2"><Coins className="w-3.5 h-3.5" /> HBAR PAYMENT LEDGER</h3>
            <span className="text-[11px] text-slate-500">On-chain micro-payments between agents</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {!data?.transactions.length
              ? <div className="px-4 py-4 text-[11px] text-slate-500">No payments yet — start workers to trigger autonomous HBAR settlement.</div>
              : data.transactions.map((tx) => <TxRow key={tx.id} tx={tx} />)}
          </div>
        </div>

        {/* ── Worker Runtime ── */}
        <div className="grid grid-cols-2 gap-5 mb-5">
          {/* Worker Status */}
          <div className="bg-[#0c1220] border border-[#1b3358] rounded-lg overflow-hidden">
            <div className="bg-[#091426] border-b border-[#1b3358] px-4 py-2.5 flex justify-between items-center">
              <h3 className="text-sky-400 text-[12px] tracking-widest flex items-center gap-2">
                <Bot className="w-3.5 h-3.5" /> OPENCLAW WORKER STATUS
              </h3>
              <span className={`text-[11px] px-2 py-0.5 rounded border ${workersRunning ? "border-green-600 text-green-400 bg-green-950" : "border-slate-600 text-slate-500"}`}>
                {workersRunning ? "● RUNNING" : "○ STOPPED"}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {!data?.workerStatus?.workers.length
                ? <div className="px-4 py-4 text-[11px] text-slate-500">Click "Start Workers" to activate autonomous agents.</div>
                : data.workerStatus.workers.map((w) => (
                  <div key={w.agentId} className="px-4 py-3 border-b border-[#0a1525] last:border-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-200">{w.agentName}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                        w.agentStatus === "busy" ? "border-orange-700 text-orange-400 bg-orange-950"
                          : w.running ? "border-green-700 text-green-400 bg-green-950"
                          : "border-slate-700 text-slate-500"
                      }`}>
                        {w.agentStatus === "busy" ? "⚙ EXECUTING" : w.running ? "● POLLING" : "○ IDLE"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap gap-3">
                      <span className="text-cyan-600">⚙ {w.capabilities.join(", ")}</span>
                      <span>Tasks: <span className="text-green-400">{w.tasksExecuted}</span></span>
                      <span>Earned: <span className="text-yellow-400">{w.totalEarned} ℏ</span></span>
                      <span>Rep: <span className="text-purple-400">{w.reputation}</span></span>
                    </div>
                    {w.currentTaskId && (
                      <div className="text-[10px] text-orange-400 mt-1 animate-pulse">
                        ⚙ Working on task {w.currentTaskId.slice(0,12)}...
                      </div>
                    )}
                    {w.lastTaskAt && (
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        Last task: {new Date(w.lastTaskAt).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>

          {/* Worker Log */}
          <div className="bg-[#0c1220] border border-[#1b3358] rounded-lg overflow-hidden">
            <div className="bg-[#091426] border-b border-[#1b3358] px-4 py-2.5 flex justify-between items-center">
              <h3 className="text-sky-400 text-[12px] tracking-widest flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5" /> AGENT RUNTIME LOG
              </h3>
              <span className="text-[11px] text-slate-500">Live autonomous execution feed</span>
            </div>
            <div className="max-h-64 overflow-y-auto font-mono">
              {!data?.workerLog?.length
                ? <div className="px-4 py-4 text-[11px] text-slate-500">No activity yet — start workers to see autonomous execution.</div>
                : data.workerLog.map((l, i) => (
                  <div key={i} className={`px-4 py-1.5 border-b border-[#0a1525] last:border-0 text-[11px] ${
                    l.level === "success" ? "text-green-400"
                      : l.level === "error" ? "text-red-400"
                      : l.level === "warn" ? "text-yellow-400"
                      : "text-slate-400"
                  }`}>
                    <span className="text-slate-600 mr-2">{new Date(l.timestamp).toLocaleTimeString()}</span>
                    <span className="text-sky-600 mr-2">[{l.agentName}]</span>
                    {l.message}
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* ── Task Results (completed work by AI agents) ── */}
        {data?.tasks.some(t => t.status === "completed" && t.result) && (
          <div className="bg-[#0c1220] border border-[#1b3358] rounded-lg overflow-hidden mb-5">
            <div className="bg-[#091426] border-b border-[#1b3358] px-4 py-2.5">
              <h3 className="text-sky-400 text-[12px] tracking-widest flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5" /> AI AGENT DELIVERABLES — GEMINI OUTPUT
              </h3>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {data.tasks.filter(t => t.status === "completed" && t.result).map(t => (
                <div key={t.id} className="px-4 py-3 border-b border-[#0a1525] last:border-0">
                  <div className="flex justify-between items-start mb-2 gap-3">
                    <div>
                      <span className="text-sm text-slate-200">{t.title}</span>
                      {t.resultHash && (
                        <div className="mt-1 text-[10px] text-slate-600 font-mono">
                          HCS proof hash: <span className="text-sky-500">{t.resultHash.slice(0, 16)}…</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-green-400 ml-4 flex-shrink-0">✓ {t.reward} ℏ paid</span>
                  </div>
                  <pre className="text-[11px] text-slate-500 whitespace-pre-wrap break-words max-h-32 overflow-y-auto bg-[#060d1a] rounded p-2 border border-[#0d1a2e]">
                    {t.result?.slice(0, 400)}{(t.result?.length ?? 0) > 400 ? "\n... [truncated]" : ""}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── Footer ── */}
      <footer className="text-center text-[11px] text-slate-500 border-t border-[#1b3358] px-6 py-4 tracking-wide">
        AgentMesh &nbsp;·&nbsp; Open Infrastructure for Agent Commerce &nbsp;·&nbsp;
        
        Powered by Hedera HCS · HTS · OpenClaw Agents
        <span className="ml-4 flex items-center gap-1 justify-center mt-1 text-sky-700">
          <ChevronRight className="w-3 h-3" />
          <a href="https://github.com/gabrieltemtsen/agent-mesh" target="_blank" className="hover:text-sky-400 transition-colors">github.com/gabrieltemtsen/agent-mesh</a>
        </span>
      </footer>

      {/* ── Modals ── */}
      <Modal open={showRegister} onClose={() => setShowRegister(false)} title="🤖 Register New Agent">
        <Field label="Agent Name"><input className={inputCls} value={regName} onChange={e=>setRegName(e.target.value)} placeholder="e.g. DataAnalyst-9" /></Field>
        <Field label="Type">
          <select className={inputCls} value={regType} onChange={e=>setRegType(e.target.value)}>
            <option value="worker">Worker</option>
            <option value="broker">Broker</option>
          </select>
        </Field>
        <Field label="Capabilities (comma-separated)"><input className={inputCls} value={regCaps} onChange={e=>setRegCaps(e.target.value)} placeholder="e.g. data_analysis, reporting" /></Field>
        <Field label="Hedera Account ID (optional)"><input className={inputCls} value={regAcct} onChange={e=>setRegAcct(e.target.value)} placeholder="0.0.XXXXXX" /></Field>
        <Field label="Description"><input className={inputCls} value={regDesc} onChange={e=>setRegDesc(e.target.value)} placeholder="What does this agent do?" /></Field>
        <div className="flex gap-3 mt-4 justify-end">
          <button onClick={() => setShowRegister(false)} className="border border-slate-600 text-slate-400 px-4 py-2 rounded text-sm hover:bg-slate-800 transition-colors">Cancel</button>
          <button onClick={handleRegister} className="border border-green-500/50 text-green-400 px-4 py-2 rounded text-sm hover:bg-green-900/30 transition-colors">Register</button>
        </div>
      </Modal>

      <Modal open={showTask} onClose={() => setShowTask(false)} title="📋 Post New Task">
        <Field label="Task Title"><input className={inputCls} value={tTitle} onChange={e=>setTTitle(e.target.value)} placeholder="e.g. Write script for kids video" /></Field>
        <Field label="Description"><input className={inputCls} value={tDesc} onChange={e=>setTDesc(e.target.value)} placeholder="What needs to be done?" /></Field>
        <Field label="Required Capability"><input className={inputCls} value={tCap} onChange={e=>setTCap(e.target.value)} placeholder="e.g. video_script" /></Field>
        <Field label="Reward (HBAR)"><input className={inputCls} type="number" value={tReward} onChange={e=>setTReward(e.target.value)} min="0.5" step="0.5" /></Field>
        <div className="flex gap-3 mt-4 justify-end">
          <button onClick={() => setShowTask(false)} className="border border-slate-600 text-slate-400 px-4 py-2 rounded text-sm hover:bg-slate-800 transition-colors">Cancel</button>
          <button onClick={handlePostTask} className="border border-green-500/50 text-green-400 px-4 py-2 rounded text-sm hover:bg-green-900/30 transition-colors">Post to HCS</button>
        </div>
      </Modal>

      {/* ── Toast ── */}
      <Toast msg={toast.msg} type={toast.type} />
    </>
  );
}
