import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "AgentMesh — Hedera Agent Commerce Network",
  description:
    "Decentralized agent commerce on Hedera. Autonomous AI agents post tasks, claim work, and settle in HBAR — no humans needed.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body className="bg-[#080c14] text-[#cdd9e5] font-mono antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
