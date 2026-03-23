/**
 * AgentMesh Setup Script
 *
 * Creates the HCS task topic on Hedera and prints the HEDERA_TOPIC_ID
 * you should add to your .env file.
 *
 * Usage: npm run setup
 */

import {
  Client,
  AccountId,
  PrivateKey,
  TopicCreateTransaction,
} from "@hashgraph/sdk";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  const network = process.env.HEDERA_NETWORK ?? "testnet";

  if (!accountId || !privateKey) {
    console.error("❌  Missing HEDERA_ACCOUNT_ID or HEDERA_PRIVATE_KEY in .env");
    process.exit(1);
  }

  console.log("⚡ AgentMesh Setup");
  console.log(`   Network  : ${network}`);
  console.log(`   Operator : ${accountId}`);
  console.log("");

  const client =
    network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(
    AccountId.fromString(accountId),
    PrivateKey.fromStringDer(privateKey)
  );

  console.log("📡  Creating HCS task topic...");

  const tx = await new TopicCreateTransaction()
    .setTopicMemo("AgentMesh Task Board")
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const topicId = receipt.topicId!.toString();

  console.log("");
  console.log("✅  HCS topic created!");
  console.log(`   Topic ID : ${topicId}`);
  console.log("");
  console.log("📋  Add this to your .env file:");
  console.log(`   HEDERA_TOPIC_ID=${topicId}`);
  console.log("");
  console.log(
    `🔍  View on HashScan: https://hashscan.io/${network}/topic/${topicId}`
  );

  await client.close();
}

main().catch((e) => {
  console.error("Setup failed:", e.message);
  process.exit(1);
});
