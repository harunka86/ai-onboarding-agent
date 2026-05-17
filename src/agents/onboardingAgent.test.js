import { test } from "node:test";
import assert from "node:assert/strict";

import { validateCustomer } from "../tools/validate.js";
import { assessRisk } from "../tools/assess.js";
import { provision } from "../tools/provision.js";
import { onboardingAgent } from "./onboardingAgent.js";
import { recordApiCall, estimateCallCost, getTotalCost } from "../utils/costTracker.js";

// ── Shared fixtures ───────────────────────────────────────────────────────────
// US free-tier, 1 seat: no GDPR (US), no healthcare/finance keywords,
// no DPA (not enterprise, seats < 100). Risk = 0.125.
const LOW_RISK_US = {
  id: "test-us-001",
  email: "alice@example.com",
  company: "Plain Corp",
  country: "US",
  tier: "free",
  seats: 1,
};

// ── 1. validateCustomer — missing fields ──────────────────────────────────────

test("validateCustomer() flags every missing required field", () => {
  const result = validateCustomer({ id: "x", company: "Acme" });

  assert.strictEqual(result.isValid, false);
  const errText = result.errors.join(" ");
  assert.ok(errText.includes("email"),   "should flag missing email");
  assert.ok(errText.includes("country"), "should flag missing country");
  assert.ok(errText.includes("tier"),    "should flag missing tier");
  assert.ok(errText.includes("seats"),   "should flag missing seats");
});

// ── 2. validateCustomer — valid customer ──────────────────────────────────────

test("validateCustomer() passes a fully valid customer with no errors", () => {
  const result = validateCustomer(LOW_RISK_US);

  assert.strictEqual(result.isValid, true);
  assert.deepStrictEqual(result.errors, []);
});

// ── 3. assessRisk — score calculation ────────────────────────────────────────
// Expected: US(0.1)*0.35 + general(0.2)*0.25 + free(0.1)*0.20 + 1-seat(0.1)*0.20 = 0.1250

test("assessRisk() computes the correct weighted score for a low-risk US customer", () => {
  const risk = assessRisk({ ...LOW_RISK_US, industry: "general" });

  assert.strictEqual(risk.riskScore, 0.125);
  assert.strictEqual(risk.reviewRequired, false);
  assert.ok(Array.isArray(risk.riskFactors) && risk.riskFactors.length === 4);
  assert.ok(
    risk.riskFactors.every((f) => f.includes("LOW")),
    `all factors should be LOW, got: ${risk.riskFactors.join(" | ")}`
  );
});

// ── 4. assessRisk — sanctioned / high-risk country ───────────────────────────
// IR(1.0)*0.35 + financial(0.65)*0.25 + enterprise(0.55)*0.20 + 1000-seats(0.8)*0.20 = 0.7825

test("assessRisk() flags a sanctioned country and sets reviewRequired=true", () => {
  const risk = assessRisk({
    id: "ir-x", company: "X Corp", country: "IR",
    tier: "enterprise", seats: 1000, industry: "financial",
  });

  assert.ok(
    risk.riskScore > 0.7,
    `riskScore ${risk.riskScore} should exceed 0.7`
  );
  assert.strictEqual(risk.reviewRequired, true);
  assert.ok(
    risk.riskFactors[0].includes("SANCTIONED"),
    `first factor should be the sanctioned-country warning, got: "${risk.riskFactors[0]}"`
  );
});

// ── 5. provision — correct tier resources and scaling ────────────────────────

test("provision() allocates correct resources per tier and skips non-approved decisions", () => {
  // Free tier, 1 seat (below scaling threshold)
  const free = provision({ ...LOW_RISK_US }, "AUTO_APPROVE");
  assert.strictEqual(free.provisioned, true);
  assert.ok(typeof free.accountId === "string" && free.accountId.length > 0);
  assert.strictEqual(free.resources.storageGb,      1);
  assert.strictEqual(free.resources.apiCallsPerDay, 100);
  assert.strictEqual(free.resources.supportLevel,   "community");
  assert.strictEqual(free.resources.ssoEnabled,     false);

  // Enterprise tier, 250 seats — storage scales: ceil(1000 * (1 + 250/100)) = 3500
  const enterprise = provision(
    { id: "e-001", email: "e@corp.com", company: "Corp", country: "US", tier: "enterprise", seats: 250 },
    "AUTO_APPROVE"
  );
  assert.strictEqual(enterprise.provisioned, true);
  assert.strictEqual(enterprise.resources.supportLevel,  "dedicated");
  assert.strictEqual(enterprise.resources.auditLogging,  true);
  assert.strictEqual(enterprise.resources.storageGb,     3500);

  // Non-approved decision must not provision anything
  const skipped = provision(LOW_RISK_US, "MANUAL_REVIEW");
  assert.strictEqual(skipped.provisioned, false);
  assert.strictEqual(skipped.accountId,  null);
  assert.strictEqual(skipped.resources,  null);
});

// ── 6. Full workflow: valid customer → approved ───────────────────────────────

test("onboardingAgent() approves a clean low-risk customer end-to-end", async () => {
  const result = await onboardingAgent({ ...LOW_RISK_US, id: "wf-001" });

  assert.strictEqual(result.decision,                "approved");
  assert.strictEqual(result.status,                  "processed");
  assert.strictEqual(result.riskScore,               0.125);
  assert.strictEqual(result.provisioning.provisioned, true);
  assert.ok(typeof result.provisioning.accountId === "string");
  assert.strictEqual(result.scheduling.scheduled,    true);
  assert.ok(typeof result.latencyMs === "number" && result.latencyMs >= 0);
  assert.deepStrictEqual(result.tokensUsed, { input: 0, output: 0 });
});

// ── 7. Full workflow: missing required field → escalated ──────────────────────

test("onboardingAgent() escalates a customer with a missing email", async () => {
  const broken = { ...LOW_RISK_US, id: "wf-002", email: "" };
  const result = await onboardingAgent(broken);

  assert.strictEqual(result.decision, "escalated");
  assert.ok(
    result.reasoning.toLowerCase().includes("email"),
    `reasoning should mention 'email', got: "${result.reasoning}"`
  );
  assert.strictEqual(result.provisioning.provisioned, false);
  assert.strictEqual(result.scheduling.scheduled,     false);
});

// ── 8. Full workflow: high-risk country → escalated for compliance review ─────
// NG is on the FATF high-risk list → triggers AML/KYC flags → escalated
// (compliance gate fires before the risk-score gate)

test("onboardingAgent() escalates a FATF high-risk country customer with AML/KYC flags", async () => {
  const highRisk = {
    id: "wf-003",
    email: "ops@lagos-corp.ng",
    company: "Lagos Corp",
    country: "NG",
    tier: "enterprise",
    seats: 100,
  };
  const result = await onboardingAgent(highRisk);

  assert.strictEqual(result.decision, "escalated");
  assert.ok(
    result.compliance?.flags?.some((f) => f.includes("AML/KYC")),
    "compliance flags should contain an AML/KYC entry"
  );
  assert.strictEqual(result.provisioning.provisioned, false);
  assert.strictEqual(result.scheduling.scheduled,     false);
});

// ── 9. costTracker — token accounting and cost math ──────────────────────────

test("costTracker accurately tracks tokens and computes cost", () => {
  // estimateCallCost is a pure function — verify the pricing formula directly
  // Pricing: $3.00/M input, $15.00/M output
  assert.strictEqual(estimateCallCost(1_000_000, 1_000_000), 18);   // $3 + $15
  assert.strictEqual(estimateCallCost(0, 0),                  0);
  assert.strictEqual(estimateCallCost(2_000_000, 0),          6);   // 2M * $3/M

  // recordApiCall accumulates into getTotalCost(); use deltas to stay
  // independent of prior state (other tests don't call recordApiCall).
  const before = getTotalCost();

  recordApiCall({ inputTokens: 500, outputTokens: 100, latencyMs: 200 });
  recordApiCall({ inputTokens: 300, outputTokens:  50, latencyMs: 100 });

  const after = getTotalCost();

  assert.strictEqual(after.totalInputTokens,  before.totalInputTokens  + 800);
  assert.strictEqual(after.totalOutputTokens, before.totalOutputTokens + 150);
  assert.strictEqual(after.totalCalls,        before.totalCalls        + 2);
  // avgLatencyMs = total_ms / total_calls = (200+100) / 2 = 150 (at minimum in this run)
  assert.ok(after.avgLatencyMs > 0, "avgLatencyMs should be positive after recording calls");
});
