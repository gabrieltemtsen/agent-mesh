/**
 * AgentMesh - Hedera Setup Script
 * Run this once to create your testnet account and HCS topic
 * Usage: node scripts/setup-hedera.js
 */

const { createTaskTopic, getBalance, createAgentAccount } = require("../src/hedera");
require("dotenv").config();

async function main() {
  console.log("\n🚀 AgentMesh — Hedera Setup\n");
  console.log(`Account ID: ${process.env.HEDERA_ACCOUNT_ID}`);

  // Check balance
  console.log("\n📊 Checking operator balance...");
  const balance = await getBalance(process.env.HEDERA_ACCOUNT_ID);
  console.log(`Balance: ${balance} HBAR`);

  if (balance < 10) {
    console.log("⚠️  Low balance! Get free testnet HBAR at: https://portal.hedera.com");
    return;
  }

  // Create HCS topic
  console.log("\n📡 Creating HCS Task Board topic...");
  const topicId = await createTaskTopic("AgentMesh Task Board — Apex Hackathon 2026");
  console.log(`✅ Topic ID: ${topicId}`);
  console.log(`   Add to .env: HEDERA_TOPIC_ID=${topicId}`);

  // Create a demo worker agent account
  console.log("\n🤖 Creating demo worker agent account...");
  const workerAccount = await createAgentAccount(5);
  console.log(`✅ Worker Account: ${workerAccount.accountId}`);
  console.log(`   Private Key: ${workerAccount.privateKey}`);
  console.log("   (Save these credentials!)\n");

  console.log("✅ Setup complete! Update your .env file with the above values.\n");
}

main().catch((e) => {
  console.error("Setup failed:", e.message);
  process.exit(1);
});
