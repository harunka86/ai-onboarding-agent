const REQUIRED_FIELDS = ["id", "email", "company", "country", "tier", "seats"];
const VALID_TIERS = ["free", "pro", "enterprise"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCustomer(customer) {
  const errors = [];
  const warnings = [];

  for (const field of REQUIRED_FIELDS) {
    if (customer[field] === undefined || customer[field] === null || customer[field] === "") {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (customer.email && !EMAIL_RE.test(customer.email)) {
    errors.push(`Invalid email format: ${customer.email}`);
  }

  if (customer.tier && !VALID_TIERS.includes(customer.tier)) {
    errors.push(`Invalid tier "${customer.tier}". Must be one of: ${VALID_TIERS.join(", ")}`);
  }

  if (customer.seats !== undefined) {
    if (!Number.isInteger(customer.seats) || customer.seats < 1) {
      errors.push(`seats must be a positive integer, got: ${customer.seats}`);
    } else if (customer.seats > 10000) {
      warnings.push(`Unusually high seat count: ${customer.seats}`);
    }
  }

  if (customer.country && !/^[A-Z]{2}$/.test(customer.country)) {
    warnings.push(`country "${customer.country}" is not a standard ISO 3166-1 alpha-2 code`);
  }

  return { isValid: errors.length === 0, errors, warnings };
}
