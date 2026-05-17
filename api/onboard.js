import { onboardingAgent } from "../src/agents/onboardingAgent.js";
import { sampleCustomers } from "../src/data/sampleCustomers.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "POST") {
    // Process a single customer supplied in the request body
    const customer = req.body;
    if (!customer || typeof customer !== "object") {
      return res.status(400).json({ error: "Request body must be a JSON customer object" });
    }
    const result = await onboardingAgent(customer);
    return res.status(200).json(result);
  }

  if (req.method === "GET") {
    // Run all 10 sample customers and return a summary + full results
    const results = [];
    for (const customer of sampleCustomers) {
      results.push(await onboardingAgent(customer));
    }

    const counts = results.reduce(
      (acc, r) => {
        if (r.decision === "approved")          acc.approved++;
        else if (r.decision === "escalated")    acc.escalated++;
        else if (r.decision === "pending_review") acc.pendingReview++;
        return acc;
      },
      { approved: 0, escalated: 0, pendingReview: 0 }
    );

    const totalMs = results.reduce((s, r) => s + r.latencyMs, 0);

    return res.status(200).json({
      summary: {
        total: results.length,
        approved: counts.approved,
        escalated: counts.escalated,
        pendingReview: counts.pendingReview,
        avgProcessingMs: Math.round(totalMs / results.length),
      },
      results,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
