import { randomUUID } from "crypto";

const TIER_RESOURCES = {
  free: {
    storageGb: 1,
    apiCallsPerDay: 100,
    maxUsers: 1,
    ssoEnabled: false,
    auditLogging: false,
    supportLevel: "community",
    dataRetentionDays: 30,
  },
  pro: {
    storageGb: 50,
    apiCallsPerDay: 10_000,
    maxUsers: 100,
    ssoEnabled: true,
    auditLogging: false,
    supportLevel: "email",
    dataRetentionDays: 365,
  },
  enterprise: {
    storageGb: 1000,
    apiCallsPerDay: 1_000_000,
    maxUsers: null, // unlimited
    ssoEnabled: true,
    auditLogging: true,
    supportLevel: "dedicated",
    dataRetentionDays: 2555, // 7 years
  },
};

// Storage scales with seat count beyond base allocation
function scaleResources(base, seats) {
  const scaled = { ...base };
  if (seats > 10)  scaled.storageGb  = Math.ceil(base.storageGb  * (1 + seats / 100));
  if (seats > 50)  scaled.apiCallsPerDay = Math.ceil(base.apiCallsPerDay * (1 + seats / 500));
  return scaled;
}

const accounts = new Map(); // in-memory store; replace with DB in production

export function provision(customer, decision) {
  if (decision !== "AUTO_APPROVE") {
    return {
      accountId: null,
      provisioned: false,
      resources: null,
      reason: `Provisioning skipped — decision is ${decision}`,
    };
  }

  const base = TIER_RESOURCES[customer.tier];
  if (!base) {
    return {
      accountId: null,
      provisioned: false,
      resources: null,
      reason: `Unknown tier: ${customer.tier}`,
    };
  }

  const resources = scaleResources(base, customer.seats ?? 1);
  const accountId = `acc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const provisionedAt = new Date().toISOString();

  const record = {
    accountId,
    customerId: customer.id,
    email: customer.email,
    company: customer.company,
    country: customer.country,
    tier: customer.tier,
    seats: customer.seats,
    resources,
    provisionedAt,
    status: "active",
  };

  accounts.set(accountId, record);

  return {
    accountId,
    provisioned: true,
    resources,
    provisionedAt,
  };
}

export function getAccount(accountId) {
  return accounts.get(accountId) ?? null;
}
