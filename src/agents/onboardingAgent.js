import { estimateCallCost } from "../utils/costTracker.js";
import { logAuditEntry } from "../utils/auditLogger.js";
import { validateCustomer } from "../tools/validate.js";
import { checkCompliance } from "../tools/compliance.js";
import { assessRisk } from "../tools/assess.js";
import { provision } from "../tools/provision.js";
import { scheduleCall } from "../tools/schedule.js";

const TOOL_TIMEOUT_MS = 5000;
const decisionLog = [];

// ─── Helpers ────────────────────────────────────────────────────────────────

function logEvent(level, customerId, message) {
  const line = `  [${level.toUpperCase()}] ${customerId}: ${message}`;
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
}

// Wraps a synchronous tool call with a timeout so hung tools don't stall the pipeline.
function withTimeout(fn, label) {
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout: ${label} exceeded ${TOOL_TIMEOUT_MS}ms`)),
        TOOL_TIMEOUT_MS
      )
    ),
  ]);
}

// Validates that the raw customer value is a usable object before any tool sees it.
function checkInputShape(customer) {
  if (customer === null || typeof customer !== "object" || Array.isArray(customer)) {
    return "customer must be a non-null plain object";
  }
  const missing = ["id", "email", "company", "country", "tier", "seats"].filter(
    (f) => customer[f] === undefined || customer[f] === null
  );
  if (missing.length) return `missing keys: ${missing.join(", ")}`;
  if (typeof customer.id !== "string" || !customer.id.trim()) {
    return "customer.id must be a non-empty string";
  }
  return null; // null = valid
}

// Ensures tokensUsed is always {input: int>=0, output: int>=0}.
function sanitizeTokens(raw) {
  const ok = (v) => Number.isInteger(v) && v >= 0;
  return {
    input:  ok(raw?.input)  ? raw.input  : 0,
    output: ok(raw?.output) ? raw.output : 0,
  };
}

// Builds an escalated result. `overrides` lets callers add compliance, warnings, etc.
function escalatedResult(customerId, reason, overrides, start) {
  const tokens = sanitizeTokens(overrides?.tokensUsed);
  return {
    customerId,
    status: "processed",
    decision: "escalated",
    reasoning: reason,
    riskScore: null,
    riskFactors: [],
    compliance: null,
    provisioning: { provisioned: false, accountId: null, resources: null, reason },
    scheduling:   { scheduled: false,   callTime: null,  calendarLink: null, reason },
    warnings: [],
    ...overrides,
    tokensUsed:    tokens,
    costEstimate:  estimateCallCost(tokens.input, tokens.output),
    latencyMs:     Date.now() - start,
  };
}

function finalise(result) {
  decisionLog.push({ ...result, loggedAt: new Date().toISOString() });
  logAuditEntry(result);
  return result;
}

export function getDecisionLog() {
  return decisionLog;
}

// ─── Main agent ─────────────────────────────────────────────────────────────

export async function onboardingAgent(customer) {
  const start = Date.now();
  const id = typeof customer?.id === "string" && customer.id ? customer.id : "unknown";

  // ── Input shape guard ────────────────────────────────────────────────────
  const shapeError = checkInputShape(customer);
  if (shapeError) {
    logEvent("error", id, `Invalid input shape — ${shapeError}`);
    return finalise(escalatedResult(id, `Invalid input: ${shapeError}`, {}, start));
  }

  // ── Step 1: Field validation ─────────────────────────────────────────────
  let validation;
  try {
    validation = await withTimeout(() => validateCustomer(customer), "validateCustomer");
  } catch (err) {
    logEvent(err.message.startsWith("Timeout") ? "warn" : "error", id, err.message);
    return finalise(escalatedResult(id, err.message, {}, start));
  }

  if (!validation.isValid) {
    return finalise(
      escalatedResult(id, validation.errors.join("; "), { warnings: validation.warnings }, start)
    );
  }

  // ── Step 2: Compliance check ─────────────────────────────────────────────
  let compliance;
  try {
    compliance = await withTimeout(() => checkCompliance(customer), "checkCompliance");
  } catch (err) {
    logEvent(err.message.startsWith("Timeout") ? "warn" : "error", id, err.message);
    return finalise(escalatedResult(id, err.message, { warnings: validation.warnings }, start));
  }

  if (!compliance.compliant) {
    return finalise(
      escalatedResult(
        id,
        `Compliance flags: ${compliance.flags.join("; ")}`,
        { reason: compliance.flags, compliance, warnings: validation.warnings },
        start
      )
    );
  }

  // ── Step 3: Risk assessment ──────────────────────────────────────────────
  let risk;
  try {
    risk = await withTimeout(
      () => assessRisk({ ...customer, industry: compliance.industry }),
      "assessRisk"
    );
  } catch (err) {
    logEvent(err.message.startsWith("Timeout") ? "warn" : "error", id, err.message);
    return finalise(
      escalatedResult(id, err.message, { compliance, warnings: validation.warnings }, start)
    );
  }

  if (risk.riskScore > 0.7) {
    const tokens = sanitizeTokens({ input: 0, output: 0 });
    return finalise({
      customerId:   id,
      status:       "processed",
      decision:     "pending_review",
      reasoning:    `Risk score ${risk.riskScore} exceeds threshold 0.7. Factors: ${risk.riskFactors.join("; ")}`,
      riskScore:    risk.riskScore,
      riskFactors:  risk.riskFactors,
      compliance,
      provisioning: { provisioned: false, accountId: null, resources: null, reason: "Pending human review" },
      scheduling:   { scheduled: false,   callTime: null,  calendarLink: null, reason: "Pending human review" },
      warnings:     validation.warnings,
      tokensUsed:   tokens,
      costEstimate: estimateCallCost(tokens.input, tokens.output),
      latencyMs:    Date.now() - start,
    });
  }

  // ── Steps 4 & 5: Provision + Schedule (run independently, never block approval) ─
  let provisioning;
  try {
    provisioning = await withTimeout(() => provision(customer, "AUTO_APPROVE"), "provision");
  } catch (err) {
    logEvent(err.message.startsWith("Timeout") ? "warn" : "error", id, err.message);
    provisioning = { provisioned: false, accountId: null, resources: null, reason: err.message };
  }

  let scheduling;
  try {
    scheduling = await withTimeout(() => scheduleCall(customer, "AUTO_APPROVE"), "scheduleCall");
  } catch (err) {
    logEvent(err.message.startsWith("Timeout") ? "warn" : "error", id, err.message);
    scheduling = { scheduled: false, callTime: null, calendarLink: null, reason: err.message };
  }

  const tokens = sanitizeTokens({ input: 0, output: 0 });
  return finalise({
    customerId:   id,
    status:       "processed",
    decision:     "approved",
    reasoning:    `Risk score ${risk.riskScore} is within acceptable threshold. No compliance blockers detected.`,
    riskScore:    risk.riskScore,
    riskFactors:  risk.riskFactors,
    compliance,
    provisioning,
    scheduling,
    warnings:     validation.warnings,
    tokensUsed:   tokens,
    costEstimate: estimateCallCost(tokens.input, tokens.output),
    latencyMs:    Date.now() - start,
  });
}
