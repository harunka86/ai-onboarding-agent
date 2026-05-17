export const sampleCustomers = [
  // --- Happy path: clean auto-approvals ---
  {
    id: "cust-001",
    email: "alice@techcorp.com",
    company: "TechCorp Inc.",
    country: "US",
    tier: "enterprise",
    seats: 250,
  },
  {
    id: "cust-002",
    email: "bob@startup.io",
    company: "Startup IO",
    country: "GB",
    tier: "pro",
    seats: 12,
  },
  // --- High-risk: compliance flags ---
  {
    id: "cust-003",
    email: "carol@globalbank.com",
    company: "Global Bank Ltd.",
    country: "NG",
    tier: "enterprise",
    seats: 500,
  },
  // --- Free tier, low-risk ---
  {
    id: "cust-004",
    email: "dave@freelance.me",
    company: "Dave Solo",
    country: "CA",
    tier: "free",
    seats: 1,
  },
  // --- Healthcare, HIPAA-triggering ---
  {
    id: "cust-005",
    email: "eve@medisafe.org",
    company: "MediSafe Health",
    country: "DE",
    tier: "pro",
    seats: 45,
  },
  // --- Sanctioned country, hard block ---
  {
    id: "cust-006",
    email: "frank@iransystems.ir",
    company: "Iran Systems Co.",
    country: "IR",
    tier: "pro",
    seats: 20,
  },
  // --- Large APAC enterprise ---
  {
    id: "cust-007",
    email: "grace@sgfintech.sg",
    company: "SG FinTech Capital",
    country: "SG",
    tier: "enterprise",
    seats: 150,
  },
  // --- Validation failure: missing email ---
  {
    id: "cust-008",
    email: "",
    company: "Broken Corp",
    country: "AU",
    tier: "pro",
    seats: 30,
  },
  // --- Healthcare enterprise, HIPAA + DPA ---
  {
    id: "cust-009",
    email: "ivan@apexhospital.jp",
    company: "Apex Medical Hospital",
    country: "JP",
    tier: "enterprise",
    seats: 800,
  },
  // --- Small EU startup, GDPR only ---
  {
    id: "cust-010",
    email: "julia@nanoapp.fr",
    company: "NanoApp SAS",
    country: "FR",
    tier: "free",
    seats: 3,
  },
];
