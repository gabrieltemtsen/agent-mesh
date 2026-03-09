/**
 * AgentMesh – Hedera SDK (server-side only)
 * Used exclusively in Next.js API route handlers (Node.js runtime)
 */

import {
  Client,
  AccountId,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TransferTransaction,
  Hbar,
  AccountCreateTransaction,
  AccountBalanceQuery,
} from "@hashgraph/sdk";

let client: InstanceType<typeof Client> | null = null;

export function getClient() {
  if (!client) {
    const accountId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID!);
    const privateKey = PrivateKey.fromStringDer(process.env.HEDERA_PRIVATE_KEY!);
    client = Client.forTestnet();
    client.setOperator(accountId, privateKey);
    client.setDefaultMaxTransactionFee(new Hbar(100));
    client.setDefaultMaxQueryPayment(new Hbar(50));
  }
  return client;
}

export async function createTaskTopic(memo = "AgentMesh Task Board") {
  const c = getClient();
  const tx = await new TopicCreateTransaction().setTopicMemo(memo).execute(c);
  const receipt = await tx.getReceipt(c);
  return receipt.topicId!.toString();
}

export async function postHcsMessage(topicId: string, payload: object) {
  const c = getClient();
  const tx = await new TopicMessageSubmitTransaction({
    topicId,
    message: JSON.stringify(payload),
  }).execute(c);
  const receipt = await tx.getReceipt(c);
  return receipt.status.toString();
}

export async function payAgent(
  recipientAccountId: string,
  hbarAmount: number,
  memo = "AgentMesh task payment"
) {
  const c = getClient();
  const sender = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID!);
  const tx = await new TransferTransaction()
    .addHbarTransfer(sender, new Hbar(-hbarAmount))
    .addHbarTransfer(AccountId.fromString(recipientAccountId), new Hbar(hbarAmount))
    .setTransactionMemo(memo)
    .execute(c);
  const receipt = await tx.getReceipt(c);
  return {
    status: receipt.status.toString(),
    transactionId: tx.transactionId.toString(),
    amount: hbarAmount,
    recipient: recipientAccountId,
  };
}

export async function getBalance(accountId: string) {
  const c = getClient();
  const balance = await new AccountBalanceQuery()
    .setAccountId(AccountId.fromString(accountId))
    .execute(c);
  return balance.hbars.toBigNumber().toNumber();
}

export async function createAgentAccount(initialBalance = 5) {
  const c = getClient();
  const newKey = PrivateKey.generateED25519();
  const tx = await new AccountCreateTransaction()
    .setKey(newKey.publicKey)
    .setInitialBalance(new Hbar(initialBalance))
    .setAccountMemo("AgentMesh Agent")
    .execute(c);
  const receipt = await tx.getReceipt(c);
  return {
    accountId: receipt.accountId!.toString(),
    publicKey: newKey.publicKey.toString(),
    privateKey: newKey.toString(),
  };
}
