import { writeFileSync, appendFileSync, readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOGS_DIR = join(ROOT, "logs");
const AUDIT_FILE = join(LOGS_DIR, "audit.jsonl");

function ensureLogFile() {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  if (!existsSync(AUDIT_FILE)) writeFileSync(AUDIT_FILE, "", "utf8");
}

export function logAuditEntry(result) {
  try {
    ensureLogFile();
    const entry = {
      timestamp: new Date().toISOString(),
      customerId: result.customerId,
      decision: result.decision,
      riskScore: result.riskScore,
      cost: result.costEstimate,
      tokens: result.tokensUsed,
    };
    appendFileSync(AUDIT_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    // Audit log failure must never crash the main workflow
    console.error(`[AUDIT ERROR] Failed to write log for ${result.customerId}: ${err.message}`);
  }
}

export function viewAuditLog() {
  try {
    ensureLogFile();
    const content = readFileSync(AUDIT_FILE, "utf8").trim();
    if (!content) return [];
    return content
      .split("\n")
      .filter(Boolean)
      .map((line, i) => {
        try {
          return JSON.parse(line);
        } catch {
          return { _parseError: true, _line: i + 1, raw: line };
        }
      });
  } catch (err) {
    console.error(`[AUDIT ERROR] Failed to read audit log: ${err.message}`);
    return [];
  }
}
