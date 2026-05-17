# AI Onboarding Agent

A rule-based customer onboarding pipeline that validates, checks compliance, assesses risk, and provisions accounts automatically. Deployed as a serverless API on Vercel.

**Live API:** https://ai-onboarding-agent-pi.vercel.app

---

## How it works

Each customer passes through four sequential gates. Any gate can halt the pipeline early:

```
validateCustomer()
  └─ invalid fields → escalated

checkCompliance()
  └─ GDPR / HIPAA / PCI-DSS / AML/KYC flags → escalated

assessRisk()
  └─ score > 0.7 → pending_review

provisionResources() + scheduleIntroCall()
  └─ success → approved
```

### Decision outcomes

| Decision | Meaning |
|---|---|
| `approved` | All gates passed. Account provisioned, intro call scheduled. |
| `escalated` | Validation failure or compliance flag. Routed to human review. |
| `pending_review` | Risk score exceeds 0.7. Awaiting human approval. |

---

## API

### `GET /api/onboard`
Runs all 10 built-in sample customers and returns a summary with full results.

```bash
curl https://ai-onboarding-agent-pi.vercel.app/api/onboard
```

```json
{
  "summary": {
    "total": 10,
    "approved": 2,
    "escalated": 8,
    "pendingReview": 0,
    "avgProcessingMs": 4
  },
  "results": [ ... ]
}
```

### `POST /api/onboard`
Process a single customer. Returns the full decision object.

```bash
curl -X POST https://ai-onboarding-agent-pi.vercel.app/api/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "id": "cust-001",
    "email": "alice@example.com",
    "company": "Acme Corp",
    "country": "US",
    "tier": "pro",
    "seats": 25
  }'
```

**Required fields**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique customer identifier |
| `email` | string | Contact email address |
| `company` | string | Company name (used to infer industry) |
| `country` | string | ISO 3166-1 alpha-2 code (e.g. `US`, `DE`, `NG`) |
| `tier` | string | `free` \| `pro` \| `enterprise` |
| `seats` | integer | Number of seats (≥ 1) |

**Example response**

```json
{
  "customerId": "cust-001",
  "decision": "approved",
  "reasoning": "Risk score 0.165 is within acceptable threshold. No compliance blockers detected.",
  "riskScore": 0.165,
  "riskFactors": ["Industry risk: LOW (20)", "Tier risk: MEDIUM (30)", "..."],
  "compliance": { "compliant": true, "regulations": [], "flags": [] },
  "provisioning": { "provisioned": true, "accountId": "acc_...", "resources": { ... } },
  "scheduling": { "scheduled": true, "callTime": { "utc": "...", "local": "..." } },
  "tokensUsed": { "input": 0, "output": 0 },
  "costEstimate": 0,
  "latencyMs": 3
}
```

---

## Project structure

```
src/
├── agents/
│   ├── onboardingAgent.js       # Main pipeline
│   └── onboardingAgent.test.js  # Unit tests (Node built-in runner)
├── tools/
│   ├── validate.js              # Field validation
│   ├── compliance.js            # GDPR, HIPAA, PCI-DSS, AML/KYC checks
│   ├── assess.js                # Weighted risk scoring
│   ├── provision.js             # Account + resource allocation
│   └── schedule.js              # Intro call scheduling
├── utils/
│   ├── auditLogger.js           # Appends JSON lines to logs/audit.jsonl
│   └── costTracker.js           # Token and cost accounting
├── data/
│   └── sampleCustomers.js       # 10 test fixtures
├── scripts/
│   └── auditViewer.js           # CLI audit log viewer
└── index.js                     # CLI runner (all 10 customers + summary)
api/
└── onboard.js                   # Vercel serverless handler
public/
└── index.html                   # Landing page
```

---

## Local development

```bash
# Install dependencies
npm install

# Copy and fill in your API key (not required — pipeline is rule-based)
cp .env.example .env

# Run all 10 sample customers
npm start

# Run unit tests
npm test

# View the audit log
npm run audit-logs
```

---

## Compliance rules

| Regulation | Trigger |
|---|---|
| **GDPR** | Customer country is EU / EEA / GB |
| **HIPAA** | Company name contains health / medical / hospital / clinic / pharma keywords |
| **PCI-DSS** | Company name contains bank / finance / payment / capital keywords |
| **AML/KYC** | Country is on the FATF high-risk / monitored list |
| **DPA** | Enterprise tier or ≥ 100 seats |

---

## Risk scoring

Risk score is a weighted blend across four dimensions (0.0 = low, 1.0 = high):

| Dimension | Weight |
|---|---|
| Country risk | 35% |
| Industry risk | 25% |
| Tier | 20% |
| Seat count | 20% |

Scores ≥ 0.5, or any sanctioned / high-risk country, set `reviewRequired: true`. Scores > 0.7 halt the pipeline with `pending_review`.

---

## Error handling

Every pipeline stage is wrapped in a try-catch with a **5-second timeout**. On any failure:
- The error is logged to `stderr` with context
- The customer is escalated rather than silently dropped
- Provision and schedule failures do not block an `approved` decision — they degrade gracefully

---

## npm scripts

| Script | Command | Description |
|---|---|---|
| `npm start` | `node src/index.js` | Run the CLI against all 10 sample customers |
| `npm test` | `node --test src/agents/onboardingAgent.test.js` | Run 9 unit tests |
| `npm run audit-logs` | `node src/scripts/auditViewer.js` | Print the audit log table |

---

## Tech stack

- **Runtime:** Node.js (ESM, no build step)
- **Tests:** `node:test` — built-in, zero dependencies
- **Deployment:** Vercel serverless functions
- **Dependencies:** `@anthropic-ai/sdk`, `dotenv`
