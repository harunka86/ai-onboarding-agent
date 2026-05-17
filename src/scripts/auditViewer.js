import { viewAuditLog } from "../utils/auditLogger.js";

const entries = viewAuditLog();

if (!entries.length) {
  console.log("No audit log entries found.");
  process.exit(0);
}

const DECISION_WIDTH = 14;
const pad = (s, n) => String(s ?? "").padEnd(n);

console.log(`=== Audit Log (${entries.length} entries) ===\n`);
console.log(
  `${"Timestamp".padEnd(26)} ${"Customer".padEnd(12)} ${"Decision".padEnd(DECISION_WIDTH)} ${"Risk".padEnd(6)}  ${"Tokens (in/out)".padEnd(16)}  Cost`
);
console.log("-".repeat(88));

for (const e of entries) {
  if (e._parseError) {
    console.log(`  [LINE ${e._line}] Parse error: ${e.raw}`);
    continue;
  }
  const risk = e.riskScore !== null && e.riskScore !== undefined ? e.riskScore.toFixed(4) : "N/A   ";
  const tokens = `${e.tokens?.input ?? 0}/${e.tokens?.output ?? 0}`;
  const cost = `$${(e.cost ?? 0).toFixed(6)}`;
  console.log(
    `${pad(e.timestamp, 26)} ${pad(e.customerId, 12)} ${pad(e.decision, DECISION_WIDTH)} ${pad(risk, 6)}  ${pad(tokens, 16)}  ${cost}`
  );
}

const totals = entries
  .filter((e) => !e._parseError)
  .reduce(
    (acc, e) => {
      acc.cost += e.cost ?? 0;
      acc.tokensIn += e.tokens?.input ?? 0;
      acc.tokensOut += e.tokens?.output ?? 0;
      acc[e.decision] = (acc[e.decision] ?? 0) + 1;
      return acc;
    },
    { cost: 0, tokensIn: 0, tokensOut: 0 }
  );

console.log("-".repeat(88));
console.log(`\nDecisions: approved=${totals.approved ?? 0}  escalated=${totals.escalated ?? 0}  pending_review=${totals.pending_review ?? 0}`);
console.log(`Tokens   : ${totals.tokensIn} in / ${totals.tokensOut} out`);
console.log(`Total cost: $${totals.cost.toFixed(6)}`);
