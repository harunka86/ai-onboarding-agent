// Country risk tiers (0.0 = low, 1.0 = high)
const COUNTRY_RISK = {
  // Low risk
  US: 0.1, CA: 0.1, AU: 0.1, NZ: 0.1, JP: 0.1, SG: 0.1,
  GB: 0.15, DE: 0.15, FR: 0.15, NL: 0.15, SE: 0.15, NO: 0.15,
  CH: 0.15, DK: 0.15, FI: 0.15, IE: 0.15, AT: 0.15, BE: 0.15,
  // Medium risk
  BR: 0.4, MX: 0.4, IN: 0.4, ZA: 0.4, AR: 0.45, TR: 0.45,
  CN: 0.5, RU: 0.55, UA: 0.5, TH: 0.4, MY: 0.35, PH: 0.45,
  // High risk
  NG: 0.75, PK: 0.75, MM: 0.8, YE: 0.85, SO: 0.9, SD: 0.8,
  SS: 0.85, CF: 0.85, CD: 0.8, AF: 0.9, LY: 0.8,
  // Sanctioned
  IR: 1.0, KP: 1.0, SY: 0.95,
};
const DEFAULT_COUNTRY_RISK = 0.35;

// Industry risk weights
const INDUSTRY_RISK = {
  healthcare: 0.6,
  financial: 0.65,
  general: 0.2,
};

// Tier multipliers
const TIER_RISK = {
  free: 0.1,
  pro: 0.3,
  enterprise: 0.55,
};

// Seat-count risk (normalised, caps at 1.0)
function seatRisk(seats) {
  if (seats <= 10)  return 0.1;
  if (seats <= 50)  return 0.25;
  if (seats <= 200) return 0.4;
  if (seats <= 500) return 0.6;
  return 0.8;
}

// Weighted blend of all risk dimensions
const WEIGHTS = {
  country:  0.35,
  industry: 0.25,
  tier:     0.20,
  seats:    0.20,
};

export function assessRisk(customer) {
  const riskFactors = [];

  const countryScore = COUNTRY_RISK[customer.country] ?? DEFAULT_COUNTRY_RISK;
  const industryScore = INDUSTRY_RISK[customer.industry] ?? INDUSTRY_RISK.general;
  const tierScore = TIER_RISK[customer.tier] ?? TIER_RISK.pro;
  const seatsScore = seatRisk(customer.seats ?? 1);

  const riskScore =
    countryScore  * WEIGHTS.country  +
    industryScore * WEIGHTS.industry +
    tierScore     * WEIGHTS.tier     +
    seatsScore    * WEIGHTS.seats;

  // Collect human-readable factors sorted high → low
  const dimensions = [
    { label: "Country risk",  value: countryScore,  weight: WEIGHTS.country },
    { label: "Industry risk", value: industryScore, weight: WEIGHTS.industry },
    { label: "Tier risk",     value: tierScore,     weight: WEIGHTS.tier },
    { label: "Seat count",    value: seatsScore,    weight: WEIGHTS.seats },
  ].sort((a, b) => b.value * b.weight - a.value * a.weight);

  for (const d of dimensions) {
    if (d.value >= 0.5) {
      riskFactors.push(`${d.label}: HIGH (${(d.value * 100).toFixed(0)})`);
    } else if (d.value >= 0.25) {
      riskFactors.push(`${d.label}: MEDIUM (${(d.value * 100).toFixed(0)})`);
    } else {
      riskFactors.push(`${d.label}: LOW (${(d.value * 100).toFixed(0)})`);
    }
  }

  // Hard blocks regardless of weighted score
  if (COUNTRY_RISK[customer.country] >= 1.0) {
    riskFactors.unshift("SANCTIONED COUNTRY — must not proceed");
  }

  const reviewRequired =
    riskScore >= 0.5 ||
    countryScore >= 0.75 ||
    (customer.industry === "financial" && customer.seats >= 100) ||
    (customer.industry === "healthcare" && customer.tier === "enterprise");

  return {
    riskScore: +riskScore.toFixed(4),
    riskFactors,
    reviewRequired,
  };
}
