// Timezone per country code (representative, not exhaustive)
const COUNTRY_TZ = {
  US: "America/New_York", CA: "America/Toronto", MX: "America/Mexico_City",
  GB: "Europe/London",    IE: "Europe/Dublin",   FR: "Europe/Paris",
  DE: "Europe/Berlin",    NL: "Europe/Amsterdam",BE: "Europe/Brussels",
  CH: "Europe/Zurich",    AT: "Europe/Vienna",   SE: "Europe/Stockholm",
  NO: "Europe/Oslo",      DK: "Europe/Copenhagen",FI: "Europe/Helsinki",
  ES: "Europe/Madrid",    IT: "Europe/Rome",     PT: "Europe/Lisbon",
  PL: "Europe/Warsaw",    CZ: "Europe/Prague",   HU: "Europe/Budapest",
  RO: "Europe/Bucharest", GR: "Europe/Athens",   EE: "Europe/Tallinn",
  LV: "Europe/Riga",      LT: "Europe/Vilnius",  SK: "Europe/Bratislava",
  SI: "Europe/Ljubljana", HR: "Europe/Zagreb",   BG: "Europe/Sofia",
  CY: "Asia/Nicosia",     MT: "Europe/Malta",    LU: "Europe/Luxembourg",
  AU: "Australia/Sydney", NZ: "Pacific/Auckland",SG: "Asia/Singapore",
  JP: "Asia/Tokyo",       IN: "Asia/Kolkata",    CN: "Asia/Shanghai",
  KR: "Asia/Seoul",       TH: "Asia/Bangkok",    MY: "Asia/Kuala_Lumpur",
  PH: "Asia/Manila",      HK: "Asia/Hong_Kong",  TW: "Asia/Taipei",
  BR: "America/Sao_Paulo",AR: "America/Argentina/Buenos_Aires",
  CL: "America/Santiago", ZA: "Africa/Johannesburg",
  NG: "Africa/Lagos",     KE: "Africa/Nairobi",  EG: "Africa/Cairo",
  AE: "Asia/Dubai",       SA: "Asia/Riyadh",     IL: "Asia/Jerusalem",
  TR: "Europe/Istanbul",  RU: "Europe/Moscow",   UA: "Europe/Kyiv",
};
const DEFAULT_TZ = "UTC";

// Preferred call slots per tier (hour in customer local time, 24h)
const TIER_SLOT_HOUR = { free: 10, pro: 10, enterprise: 9 };

function nextBusinessDay(fromDate) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + 1);
  // Skip Saturday (6) and Sunday (0)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

function buildCallTime(customer) {
  const tz = COUNTRY_TZ[customer.country] ?? DEFAULT_TZ;
  const slotHour = TIER_SLOT_HOUR[customer.tier] ?? 10;

  const tomorrow = nextBusinessDay(new Date());

  // Construct the call time in the customer's local timezone using Intl
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const localDateStr = formatter.format(tomorrow); // YYYY-MM-DD
  const [year, month, day] = localDateStr.split("-").map(Number);

  // Build a UTC instant for that local date + slot hour
  const localMidnight = new Date(`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}T00:00:00`);
  const offsetMs = getUtcOffsetMs(tz, localMidnight);
  const callUtc = new Date(localMidnight.getTime() - offsetMs + slotHour * 3600_000);

  return { callUtc, tz, slotHour, localDateStr: `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}` };
}

function getUtcOffsetMs(tz, date) {
  // Derive UTC offset by comparing UTC parts vs local parts
  const utcParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);

  const tzParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);

  const get = (parts, type) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  const utcH = get(utcParts, "hour"),  utcM = get(utcParts, "minute");
  const tzH  = get(tzParts,  "hour"),  tzM  = get(tzParts,  "minute");

  return ((tzH - utcH) * 60 + (tzM - utcM)) * 60_000;
}

function buildCalendarLink(customer, callUtc, durationMin = 30) {
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

  const endUtc = new Date(callUtc.getTime() + durationMin * 60_000);
  const title  = encodeURIComponent(`Onboarding Intro Call — ${customer.company}`);
  const details = encodeURIComponent(
    `Welcome call for ${customer.company} (${customer.tier} tier, ${customer.seats} seats).`
  );

  return `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${title}&dates=${fmt(callUtc)}/${fmt(endUtc)}&details=${details}`;
}

export function scheduleCall(customer, decision) {
  // Only schedule for approved or review-needed accounts, not hard flags
  if (decision === "FLAG") {
    return {
      scheduled: false,
      callTime: null,
      calendarLink: null,
      reason: "Call not scheduled — account is flagged for compliance review",
    };
  }

  const { callUtc, tz, slotHour, localDateStr } = buildCallTime(customer);
  const calendarLink = buildCalendarLink(customer, callUtc);

  return {
    scheduled: true,
    callTime: {
      utc: callUtc.toISOString(),
      local: `${localDateStr} ${String(slotHour).padStart(2,"0")}:00 ${tz}`,
    },
    calendarLink,
    durationMinutes: 30,
  };
}
