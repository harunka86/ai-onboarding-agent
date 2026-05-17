import "dotenv/config";
import { sampleCustomers } from "./data/sampleCustomers.js";
import { onboardingAgent } from "./agents/onboardingAgent.js";

const DECISION_ICON = { approved: "✓", escalated: "✗", pending_review: "~" };

function printResult(result) {
  const icon = DECISION_ICON[result.decision] ?? "?";
  console.log(`  Decision  : [${icon}] ${result.decision}`);

  if (result.reasoning) {
    console.log(`  Reasoning : ${result.reasoning}`);
  }

  if (result.riskScore !== null && result.riskScore !== undefined) {
    console.log(`  Risk      : ${result.riskScore} / 1.0`);
    result.riskFactors?.forEach((f) => console.log(`              ${f}`));
  }

  const c = result.compliance;
  if (c?.regulations?.length) {
    console.log(`  Regs      : ${c.regulations.join(", ")}`);
  }
  if (c?.flags?.length) {
    c.flags.forEach((f) => console.log(`    [FLAG]  ${f}`));
  }
  if (c?.requiredApprovals?.length) {
    console.log(`  Approvals : ${c.requiredApprovals.join(", ")}`);
  }

  const p = result.provisioning;
  if (p?.provisioned) {
    const r = p.resources;
    console.log(`  Account   : ${p.accountId}  (${p.provisionedAt})`);
    console.log(`  Resources : ${r.storageGb}GB | ${r.apiCallsPerDay.toLocaleString()} API calls/day | ${r.supportLevel} support`);
  } else {
    console.log(`  Account   : not provisioned — ${p?.reason}`);
  }

  const s = result.scheduling;
  if (s?.scheduled) {
    console.log(`  Call      : ${s.callTime.local} (${s.durationMinutes}min)`);
  } else {
    console.log(`  Call      : not scheduled — ${s?.reason}`);
  }

  if (result.warnings?.length) {
    result.warnings.forEach((w) => console.log(`  [WARN]    ${w}`));
  }

  console.log(`  Time      : ${result.latencyMs}ms`);
}

async function main() {
  console.log("=== AI Onboarding Agent ===");
  console.log(`Processing ${sampleCustomers.length} customers...\n`);

  const results = [];
  for (const customer of sampleCustomers) {
    console.log(`[${customer.id}] ${customer.company} (${customer.country} · ${customer.tier} · ${customer.seats} seats)`);
    const result = await onboardingAgent(customer);
    results.push(result);
    printResult(result);
    console.log();
  }

  const counts = results.reduce(
    (acc, r) => {
      if (r.decision === "approved")       acc.approved++;
      else if (r.decision === "escalated") acc.escalated++;
      else if (r.decision === "pending_review") acc.pendingReview++;
      return acc;
    },
    { approved: 0, escalated: 0, pendingReview: 0 }
  );

  const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed.input + r.tokensUsed.output, 0);
  const totalCost   = results.reduce((sum, r) => sum + r.costEstimate, 0);
  const totalMs     = results.reduce((sum, r) => sum + r.latencyMs, 0);
  const avgSeconds  = (totalMs / results.length / 1000).toFixed(3);
  const costPerCustomer = results.length ? totalCost / results.length : 0;

  console.log("=== Summary ===");
  console.log(`  Total customers     : ${results.length}`);
  console.log(`  Approved            : ${counts.approved} | Escalated: ${counts.escalated} | Pending review: ${counts.pendingReview}`);
  console.log(`  Total tokens        : ${totalTokens}`);
  console.log(`  Estimated cost      : $${totalCost.toFixed(2)}`);
  console.log(`  Cost per customer   : $${costPerCustomer.toFixed(2)}`);
  console.log(`  Avg processing time : ${avgSeconds} seconds`);
}

main();
