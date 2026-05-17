// Countries subject to GDPR (EU + EEA)
const GDPR_COUNTRIES = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI","FR","GR","HR","HU",
  "IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK",
  "IS","LI","NO", // EEA non-EU
  "GB", // UK GDPR post-Brexit
]);

// FATF high-risk / monitored jurisdictions (grey/black list subset)
const HIGH_RISK_COUNTRIES = new Set([
  "NG","PK","SY","IR","KP","MM","YE","SS","SD","LY","SO","CF","CD","AF",
]);

// Industries inferred from company name keywords that trigger HIPAA consideration
const HIPAA_KEYWORDS = ["health","medical","hospital","clinic","pharma","med","care","dental","therapy"];

// Industries that trigger PCI-DSS consideration
const PCI_KEYWORDS = ["bank","financial","finance","payment","insurance","invest","credit","capital","trade"];

function inferIndustry(company = "") {
  const lower = company.toLowerCase();
  if (HIPAA_KEYWORDS.some((k) => lower.includes(k))) return "healthcare";
  if (PCI_KEYWORDS.some((k) => lower.includes(k)))   return "financial";
  return "general";
}

function applicableRegulations(customer) {
  const regs = [];
  if (GDPR_COUNTRIES.has(customer.country))      regs.push("GDPR");
  if (customer.industry === "healthcare")         regs.push("HIPAA");
  if (customer.industry === "financial")          regs.push("PCI-DSS");
  if (HIGH_RISK_COUNTRIES.has(customer.country)) regs.push("AML/KYC");
  if (customer.tier === "enterprise" || customer.seats >= 100) regs.push("DPA");
  return regs;
}

function runChecks(customer, regulations) {
  const flags = [];
  const requiredApprovals = [];

  // GDPR
  if (regulations.includes("GDPR")) {
    if (!customer.dpaSignedAt) {
      flags.push("GDPR: Data Processing Agreement not signed");
      requiredApprovals.push("legal-dpa");
    }
  }

  // HIPAA
  if (regulations.includes("HIPAA")) {
    if (!customer.baaSignedAt) {
      flags.push("HIPAA: Business Associate Agreement not signed");
      requiredApprovals.push("legal-baa");
    }
    if (customer.tier === "free") {
      flags.push("HIPAA: Free tier does not meet minimum security requirements");
      requiredApprovals.push("security-review");
    }
  }

  // PCI-DSS
  if (regulations.includes("PCI-DSS")) {
    flags.push("PCI-DSS: Customer must provide current compliance attestation (AOC)");
    requiredApprovals.push("compliance-aoc");
  }

  // AML / KYC
  if (regulations.includes("AML/KYC")) {
    flags.push(`AML/KYC: ${customer.country} is a FATF high-risk jurisdiction — enhanced due diligence required`);
    requiredApprovals.push("aml-review");
    if (customer.tier === "enterprise" || customer.seats >= 100) {
      flags.push("AML/KYC: Large enterprise in high-risk country requires beneficial ownership disclosure");
      requiredApprovals.push("kyc-beneficial-ownership");
    }
  }

  // DPA (internal data-processing approval for large accounts)
  if (regulations.includes("DPA")) {
    if (customer.seats >= 500) {
      flags.push("DPA: Accounts with 500+ seats require security architecture review");
      requiredApprovals.push("security-architecture");
    }
  }

  return { flags, requiredApprovals: [...new Set(requiredApprovals)] };
}

export function checkCompliance(customer) {
  const industry = inferIndustry(customer.company);
  const enriched = { ...customer, industry };

  const regulations = applicableRegulations(enriched);
  const { flags, requiredApprovals } = runChecks(enriched, regulations);

  return {
    compliant: flags.length === 0,
    regulations,
    flags,
    requiredApprovals,
    industry,
  };
}
