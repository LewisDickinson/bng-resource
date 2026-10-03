import React, { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

// Baked-in category data. Prices: Biodiversity Units UK Pricing Report, July 2026.
// Establishment/ongoing costs: derived from Arbtech's BNG creation & maintenance
// cost guide for Grassland, Woodland and Scrub only — Floodplain Wetland Mosaic,
// Ponds and Heathland have no Arbtech equivalent and are estimated by pattern,
// not sourced. Yield (units/ha) figures are the user's own metric-derived
// low/mid/high estimates.
const HABITAT_DATA = {
  grassland: {
    label: "Grassland",
    price: 28000,
    yieldLow: 3.09, yieldAvg: 6.12, yieldHigh: 10.64,
    establishmentYears: 1, establishmentCostPerUnit: 1600, ongoingCostPerUnit: 80,
  },
  woodland: {
    label: "Woodland",
    price: 42000,
    yieldLow: 1.27, yieldAvg: 4.3, yieldHigh: 6.8,
    establishmentYears: 5, establishmentCostPerUnit: 1300, ongoingCostPerUnit: 290,
  },
  floodplain_wetland_mosaic: {
    label: "Floodplain Wetland Mosaic",
    price: 48000,
    yieldLow: 1.66, yieldAvg: 4.425, yieldHigh: 8.28,
    // Establishment: £50,000/ha up-front capital works (scrapes, ponds, earthworks) —
    // a low-end estimate, not a full sourced figure. Ongoing: Countryside Stewardship
    // CWT14 rate, £1,605/ha/yr, used as a proxy for standing management cost. Both ÷ avg yield 4.425.
    establishmentYears: 1, establishmentCostPerUnit: 11299, ongoingCostPerUnit: 363,
  },
  scrub: {
    label: "Scrub",
    price: 20000,
    yieldLow: 3.86, yieldAvg: 8.2, yieldHigh: 9.6,
    establishmentYears: 2, establishmentCostPerUnit: 1000, ongoingCostPerUnit: 70,
  },
  ponds: {
    label: "Ponds",
    price: 60000,
    yieldLow: 7.19, yieldAvg: 8.25, yieldHigh: 10.57,
    // Establishment: £50,000/ha (sasaquatics.com), Ongoing: £500/ha/yr (owner's
    // organisation day rate, chainsaw + chipper team), both ÷ avg yield 8.25.
    establishmentYears: 1, establishmentCostPerUnit: 6061, ongoingCostPerUnit: 61,
  },
  heathland: {
    label: "Heathland",
    price: 27000,
    yieldLow: 1.94, yieldAvg: 5.93, yieldHigh: 9.3,
    // Establishment: £3,500/ha (adjusted from Cheshire Wildlife Trust SMDA
    // offsetting table 4.2, £3,892/ha, to avoid double-counting costs modelled
    // elsewhere). Ongoing: Countryside Stewardship LH1 rate, £412/ha/yr. Both ÷ avg yield 5.93.
    establishmentYears: 2, establishmentCostPerUnit: 590, ongoingCostPerUnit: 70,
  },
};

const PROFILES = [
  { id: "mixed_general", label: "Mixed general bank", mixText: "80% Grassland · 10% Woodland · 10% Scrub", mix: { grassland: 0.8, woodland: 0.1, scrub: 0.1 } },
  { id: "grassland_only", label: "Grassland specialist", mixText: "100% Grassland", mix: { grassland: 1.0 } },
  { id: "broad_mixed", label: "Broad mixed bank", mixText: "70% Grassland · 5% Woodland · 10% Scrub · 15% Ponds", mix: { grassland: 0.7, woodland: 0.05, scrub: 0.1, ponds: 0.15 } },
  { id: "fwm_only", label: "Floodplain Wetland Mosaic specialist", mixText: "100% Floodplain Wetland Mosaic", mix: { floodplain_wetland_mosaic: 1.0 } },
  { id: "heath_led", label: "Heathland-led mixed bank", mixText: "60% Heathland · 10% Grassland · 20% Scrub · 10% Ponds", mix: { heathland: 0.6, grassland: 0.1, scrub: 0.2, ponds: 0.1 } },
];

function currency(n) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
}

function simulateYearsFunded({ pot, roleCost, overheadCost, habitatCostAtYear, inflationPct }) {
  let remaining = pot;
  let growth = 1;
  const g = 1 + inflationPct / 100;
  let years = 0;
  for (let t = 1; t <= 200; t++) {
    const base = roleCost + overheadCost + habitatCostAtYear(t);
    const cost = base * growth;
    if (cost <= 0) return 200;
    if (remaining >= cost) {
      remaining -= cost;
      years += 1;
    } else {
      years += remaining / cost;
      return years;
    }
    growth *= g;
  }
  return years;
}

export default function BNGEconomicsModelSimple() {
  const [profileId, setProfileId] = useState("mixed_general");
  const [entryMode, setEntryMode] = useState("units"); // "units" | "hectares"
  const [totalUnitsInput, setTotalUnitsInput] = useState(50);
  const [totalHectaresInput, setTotalHectaresInput] = useState(10);
  const [yieldScenario, setYieldScenario] = useState("yieldAvg");
  const [yearsUntilSale, setYearsUntilSale] = useState(0);
  const [upfrontCosts, setUpfrontCosts] = useState(15000);
  const [staffingType, setStaffingType] = useState("employed"); // "employed" | "contractor" | "blend"
  const [numberOfRoles, setNumberOfRoles] = useState(1);
  const [salaryPerRole, setSalaryPerRole] = useState(35000);
  const [overheadPerRole, setOverheadPerRole] = useState(12000);
  const [numberOfContractors, setNumberOfContractors] = useState(1);
  const [contractorAnnualCost, setContractorAnnualCost] = useState(18000);
  const [inflationPct, setInflationPct] = useState(3);
  const [showAssumptions, setShowAssumptions] = useState(false);

  const OBLIGATION_YEARS = 30;
  const growthFactor = 1 + inflationPct / 100;
  const profile = PROFILES.find((p) => p.id === profileId);

  // Mix stays a split of units throughout — units are the saleable asset, not
  // hectares. To let someone enter hectares instead, we invert the same
  // units->hectares relationship: hectares = units * sum(frac/yield), so
  // units = hectares / sum(frac/yield), using whichever yield scenario is selected.
  const haPerUnitAtCurrentMix = useMemo(() => {
    return Object.entries(profile.mix).reduce((sum, [catKey, frac]) => {
      const d = HABITAT_DATA[catKey];
      return sum + frac / d[yieldScenario];
    }, 0);
  }, [profile, yieldScenario]);

  const totalUnits = useMemo(() => {
    if (entryMode === "units") return totalUnitsInput;
    return haPerUnitAtCurrentMix > 0 ? totalHectaresInput / haPerUnitAtCurrentMix : 0;
  }, [entryMode, totalUnitsInput, totalHectaresInput, haPerUnitAtCurrentMix]);

  const categoryUnits = useMemo(() => {
    return Object.entries(profile.mix).map(([catKey, frac]) => ({
      catKey,
      data: HABITAT_DATA[catKey],
      units: totalUnits * frac,
    }));
  }, [profile, totalUnits]);

  function grossRevenueAt(units) {
    return Object.entries(profile.mix).reduce((sum, [catKey, frac]) => {
      const d = HABITAT_DATA[catKey];
      const effPrice = d.price * Math.pow(growthFactor, yearsUntilSale);
      return sum + units * frac * effPrice;
    }, 0);
  }
  function habitatCostAtYearFor(units) {
    return (year) =>
      Object.entries(profile.mix).reduce((sum, [catKey, frac]) => {
        const d = HABITAT_DATA[catKey];
        const u = units * frac;
        const estYears = Math.max(1, d.establishmentYears);
        const perYear = year <= d.establishmentYears ? d.establishmentCostPerUnit / estYears : d.ongoingCostPerUnit;
        return sum + u * perYear;
      }, 0);
  }

  // Contractors are assumed to carry their own equipment/admin cost within
  // their annual rate, so overhead-per-head only applies to employed roles.
  function staffCosts() {
    const employedCost = staffingType !== "contractor" ? numberOfRoles * salaryPerRole : 0;
    const employedOverhead = staffingType !== "contractor" ? numberOfRoles * overheadPerRole : 0;
    const contractorCost = staffingType !== "employed" ? numberOfContractors * contractorAnnualCost : 0;
    return { roleCost: employedCost + contractorCost, overheadCost: employedOverhead };
  }

  const calc = useMemo(() => {
    const { roleCost, overheadCost } = staffCosts();

    function statsAt(units) {
      const gross = grossRevenueAt(units);
      const pot = Math.max(0, gross - upfrontCosts);
      const years = simulateYearsFunded({ pot, roleCost, overheadCost, habitatCostAtYear: habitatCostAtYearFor(units), inflationPct });
      return { gross, pot, years };
    }

    const at = statsAt(totalUnits);

    const CEILING_UNITS = 2_000_000;
    const ceilingYears = statsAt(CEILING_UNITS).years;
    const reachable = ceilingYears >= OBLIGATION_YEARS;

    let unitsFor30 = null;
    if (reachable) {
      let lo = 0, hi = CEILING_UNITS;
      for (let i = 0; i < 45; i++) {
        const mid = (lo + hi) / 2;
        const y = statsAt(mid).years;
        if (y < OBLIGATION_YEARS) lo = mid; else hi = mid;
      }
      unitsFor30 = hi;
    }

    const hectaresNeeded = categoryUnits.reduce((sum, c) => sum + c.units / c.data[yieldScenario], 0);

    return { roleCost, overheadCost, grossRevenue: at.gross, netPot: at.pot, yearsFunded: at.years, reachable, unitsFor30, ceilingYears, hectaresNeeded };
  }, [profile, totalUnits, yearsUntilSale, upfrontCosts, staffingType, numberOfRoles, salaryPerRole, overheadPerRole, numberOfContractors, contractorAnnualCost, inflationPct, yieldScenario, categoryUnits, growthFactor]);

  const chartData = useMemo(() => {
    const { roleCost, overheadCost } = staffCosts();
    const maxUnits = calc.reachable ? Math.max(120, Math.ceil(calc.unitsFor30 * 1.4)) : Math.max(300, totalUnits * 3);
    const step = Math.max(1, Math.round(maxUnits / 40));
    const points = [];
    for (let u = 0; u <= maxUnits; u += step) {
      const gross = grossRevenueAt(u);
      const pot = Math.max(0, gross - upfrontCosts);
      const years = simulateYearsFunded({ pot, roleCost, overheadCost, habitatCostAtYear: habitatCostAtYearFor(u), inflationPct });
      points.push({ units: u, years: Math.round(years * 10) / 10 });
    }
    return points;
  }, [profile, staffingType, numberOfRoles, salaryPerRole, overheadPerRole, numberOfContractors, contractorAnnualCost, inflationPct, upfrontCosts, yearsUntilSale, calc.reachable, calc.unitsFor30, totalUnits]);

  return (
    <div className="bng-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .bng-root {
          --paper: #F2EFE6; --paper-raised: #FBF9F3; --ink: #1F2A1D; --ink-soft: #4A5245;
          --moss: #4B6043; --moss-dark: #37472F; --amber: #C17817; --brick: #A83E3E;
          --dyke: #3C6E82; --hairline: #CFC7AC;
          font-family: 'IBM Plex Sans', sans-serif; color: var(--ink); background: var(--paper);
          padding: 22px; border-radius: 3px; font-size: 14px; line-height: 1.45;
        }
        .bng-root * { box-sizing: border-box; }
        .bng-h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 20px; margin: 0 0 3px; }
        .bng-h2 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 14.5px; margin: 0 0 3px; }
        .bng-sub { color: var(--ink-soft); font-size: 12.5px; margin-bottom: 20px; }
        .bng-mono { font-family: 'IBM Plex Mono', monospace; }
        .bng-grid { display: grid; grid-template-columns: 300px 1fr; gap: 20px; }
        @media (max-width: 760px) { .bng-grid { grid-template-columns: 1fr; } }
        .bng-panel { background: var(--paper-raised); border: 1px solid var(--hairline); border-radius: 3px; padding: 16px; }
        .bng-field { margin-bottom: 16px; }
        .bng-field:last-child { margin-bottom: 0; }
        .bng-label { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-soft); margin-bottom: 6px; }
        .bng-label .val { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; color: var(--ink); text-transform: none; letter-spacing: 0; }
        input[type="range"] { width: 100%; accent-color: var(--moss); cursor: pointer; }
        input[type="number"] { padding: 7px 9px; border: 1px solid var(--hairline); background: var(--paper); font-family: 'IBM Plex Mono', monospace; font-size: 13px; border-radius: 2px; color: var(--ink); width: 100%; }
        select { width: 100%; padding: 8px 10px; border: 1px solid var(--hairline); background: var(--paper); font-family: inherit; font-size: 13px; border-radius: 2px; color: var(--ink); }
        .bng-habitat-note { font-size: 11.5px; color: var(--ink-soft); margin-top: 6px; }
        .bng-stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
        @media (max-width: 700px) { .bng-stat-row { grid-template-columns: 1fr 1fr; } }
        .bng-stat { border: 1px solid var(--hairline); background: var(--paper-raised); padding: 12px 13px; border-radius: 3px; }
        .bng-stat .num { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; line-height: 1.1; }
        .bng-stat .lab { font-size: 10.5px; color: var(--ink-soft); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
        .bng-stat.warn .num { color: var(--brick); }
        .bng-stat.ok .num { color: var(--moss-dark); }
        .bng-flag { border-left: 3px solid var(--amber); background: #F4E6D3; padding: 10px 14px; font-size: 13px; border-radius: 2px; margin-bottom: 12px; }
        .bng-flag.brick { border-left-color: var(--brick); background: #F2DCDC; }
        .bng-flag.ok { border-left-color: var(--moss); background: #E4E9DD; }
        .bng-chart-wrap { border: 1px solid var(--hairline); background: var(--paper-raised); border-radius: 3px; padding: 14px 14px 6px; margin-bottom: 16px; }
        .bng-chart-title { font-size: 12.5px; color: var(--ink-soft); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
        .bng-toggle-row { display: flex; gap: 6px; }
        .bng-toggle-btn { flex: 1; border: 1px solid var(--hairline); background: var(--paper); color: var(--ink-soft); font-size: 12px; padding: 7px 8px; border-radius: 2px; font-family: inherit; cursor: pointer; }
        .bng-toggle-btn.active { background: var(--moss); border-color: var(--moss); color: var(--paper-raised); font-weight: 500; }
        .bng-assumptions-toggle { background: none; border: 1.5px solid var(--moss); color: var(--moss-dark); font-size: 14.5px; font-weight: 500; padding: 12px 22px; border-radius: 2px; font-family: inherit; cursor: pointer; }
        .bng-assumptions-toggle:hover { border-color: var(--moss); color: var(--moss-dark); }
        .bng-assumptions { border: 1px solid var(--hairline); background: var(--paper-raised); border-radius: 3px; padding: 16px 18px; margin-top: 12px; font-size: 12.5px; color: var(--ink-soft); }
        .bng-assumptions p { margin: 0 0 10px; }
        .bng-assumptions a { color: var(--dyke); text-decoration: underline; }
        .bng-assumptions table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        .bng-assumptions th, .bng-assumptions td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--hairline); }
        .bng-assumptions th { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-soft); }
      `}</style>

      <div className="bng-h1">BNG economics model - simple</div>
      <div className="bng-sub">A quick viability check for a habitat bank owner or prospective owner — pick a bank profile, set a bank size, and see whether the economics come close to funding extra staff over the 30-year obligation.</div>

      <div className="bng-grid">
        <div>
          <div className="bng-panel" style={{ marginBottom: 14 }}>
            <div className="bng-h2" style={{ marginBottom: 12 }}>Costs</div>
            <div className="bng-field">
              <div className="bng-label"><span>Up-front set-up costs</span><span className="val">{currency(upfrontCosts)}</span></div>
              <input type="number" min="0" step="500" value={upfrontCosts} onChange={(e) => setUpfrontCosts(Math.max(0, +e.target.value))} />
              <div className="bng-habitat-note">Legal fees, Responsible Body payment, offsite register fee, and similar one-off costs to establish the bank.</div>
            </div>
            <div className="bng-field">
              <div className="bng-label"><span>Staffing type</span></div>
              <div className="bng-toggle-row">
                <button className={`bng-toggle-btn ${staffingType === "employed" ? "active" : ""}`} onClick={() => setStaffingType("employed")}>Employed</button>
                <button className={`bng-toggle-btn ${staffingType === "contractor" ? "active" : ""}`} onClick={() => setStaffingType("contractor")}>Contractor</button>
                <button className={`bng-toggle-btn ${staffingType === "blend" ? "active" : ""}`} onClick={() => setStaffingType("blend")}>Blend</button>
              </div>
            </div>

            {(staffingType === "employed" || staffingType === "blend") && (
              <>
                <div className="bng-field">
                  <div className="bng-label"><span>Number of employed roles</span></div>
                  <input type="number" min="0" max="10" value={numberOfRoles} onChange={(e) => setNumberOfRoles(Math.max(0, +e.target.value))} />
                </div>
                <div className="bng-field">
                  <div className="bng-label"><span>Full salary including on-costs, pension, etc</span><span className="val">{currency(salaryPerRole)}</span></div>
                  <input type="range" min="25000" max="55000" step="500" value={salaryPerRole} onChange={(e) => setSalaryPerRole(+e.target.value)} />
                </div>
                <div className="bng-field">
                  <div className="bng-label"><span>Overhead, per employed role (annual)</span><span className="val">{currency(overheadPerRole)}</span></div>
                  <input type="range" min="0" max="30000" step="500" value={overheadPerRole} onChange={(e) => setOverheadPerRole(+e.target.value)} />
                  <div className="bng-habitat-note">Management time, equipment, admin & infrastructure supporting the role — not the habitat work itself, and not the bank's one-off set-up costs above. Doesn't apply to contractors below, whose rate is assumed to include their own overhead.</div>
                </div>
              </>
            )}

            {(staffingType === "contractor" || staffingType === "blend") && (
              <>
                <div className="bng-field">
                  <div className="bng-label"><span>Number of contractors</span></div>
                  <input type="number" min="0" max="10" value={numberOfContractors} onChange={(e) => setNumberOfContractors(Math.max(0, +e.target.value))} />
                </div>
                <div className="bng-field">
                  <div className="bng-label"><span>Annual contractor cost (all-inclusive)</span><span className="val">{currency(contractorAnnualCost)}</span></div>
                  <input type="range" min="5000" max="60000" step="500" value={contractorAnnualCost} onChange={(e) => setContractorAnnualCost(+e.target.value)} />
                  <div className="bng-habitat-note">Per contractor, per year — assumed to already include their equipment, admin and any markup, so no separate overhead is added on top.</div>
                </div>
              </>
            )}
            <div className="bng-field">
              <div className="bng-label"><span>Annual cost inflation</span><span className="val">{inflationPct}%</span></div>
              <input type="range" min="0" max="8" step="0.5" value={inflationPct} onChange={(e) => setInflationPct(+e.target.value)} />
              <div className="bng-habitat-note">Applies to salary, overhead, habitat costs, and — if selling later than now — unit price.</div>
            </div>
          </div>

          <div className="bng-panel">
            <div className="bng-h2" style={{ marginBottom: 12 }}>Habitat Bank</div>
            <div className="bng-field">
              <div className="bng-label"><span>Bank profile</span></div>
              <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                {PROFILES.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
              </select>
              <div className="bng-habitat-note">{profile.mixText}</div>
            </div>
            <div className="bng-field">
              <div className="bng-label"><span>I know my...</span></div>
              <div className="bng-toggle-row">
                <button className={`bng-toggle-btn ${entryMode === "units" ? "active" : ""}`} onClick={() => setEntryMode("units")}>Units</button>
                <button className={`bng-toggle-btn ${entryMode === "hectares" ? "active" : ""}`} onClick={() => setEntryMode("hectares")}>Hectares</button>
              </div>
            </div>
            {entryMode === "units" ? (
              <div className="bng-field">
                <div className="bng-label"><span>Total units on the bank</span></div>
                <input type="number" min="0" step="1" value={totalUnitsInput} onChange={(e) => setTotalUnitsInput(Math.max(0, +e.target.value))} />
              </div>
            ) : (
              <div className="bng-field">
                <div className="bng-label"><span>Total hectares available</span></div>
                <input type="number" min="0" step="0.5" value={totalHectaresInput} onChange={(e) => setTotalHectaresInput(Math.max(0, +e.target.value))} />
                <div className="bng-habitat-note">≈{totalUnits.toFixed(1)} units at this profile's mix and the selected yield scenario below.</div>
              </div>
            )}
            <div className="bng-field">
              <div className="bng-label"><span>Est Years Until All Units Are Sold</span><span className="val">{yearsUntilSale}</span></div>
              <input type="range" min="0" max="15" value={yearsUntilSale} onChange={(e) => setYearsUntilSale(+e.target.value)} />
              <div className="bng-habitat-note">Unit prices inflate forward by this many years before sale.</div>
            </div>
            <div className="bng-field">
              <div className="bng-label"><span>Yield scenario</span></div>
              <div className="bng-toggle-row">
                <button className={`bng-toggle-btn ${yieldScenario === "yieldLow" ? "active" : ""}`} onClick={() => setYieldScenario("yieldLow")}>Low</button>
                <button className={`bng-toggle-btn ${yieldScenario === "yieldAvg" ? "active" : ""}`} onClick={() => setYieldScenario("yieldAvg")}>Mid</button>
                <button className={`bng-toggle-btn ${yieldScenario === "yieldHigh" ? "active" : ""}`} onClick={() => setYieldScenario("yieldHigh")}>High</button>
              </div>
              <div className="bng-habitat-note">
                {entryMode === "hectares"
                  ? "In hectares mode this drives the whole calculation — it sets how many units your land actually produces."
                  : "In units mode this only affects the estimated hectares needed below — not the financials."}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="bng-stat-row">
            <div className="bng-stat">
              <div className="num bng-mono">{currency(calc.netPot)}</div>
              <div className="lab">Net pot</div>
            </div>
            <div className={`bng-stat ${calc.yearsFunded >= OBLIGATION_YEARS ? "ok" : "warn"}`}>
              <div className="num bng-mono">{calc.yearsFunded >= 200 ? "200+" : calc.yearsFunded.toFixed(1)}</div>
              <div className="lab">Years funded</div>
            </div>
            <div className="bng-stat">
              <div className="num bng-mono">{calc.reachable ? Math.ceil(calc.unitsFor30) : "—"}</div>
              <div className="lab">Units needed for 30 yrs</div>
            </div>
            <div className="bng-stat">
              <div className="num bng-mono">{calc.hectaresNeeded.toFixed(1)}</div>
              <div className="lab">Est. hectares needed</div>
            </div>
          </div>

          {!calc.reachable && (
            <div className="bng-flag brick">
              30 years isn't reachable by adding units alone at this profile — even at 2,000,000 units, years funded plateaus at roughly {calc.ceilingYears.toFixed(1)}. Ongoing habitat cost scales with units at the same rate as revenue, so past a point extra units mostly cover their own upkeep. The lever that moves this is the mix, or the fixed team cost — not bank size.
            </div>
          )}
          {calc.reachable && calc.yearsFunded < OBLIGATION_YEARS && (
            <div className="bng-flag brick">
              At {totalUnits} units in this profile, you get {calc.yearsFunded.toFixed(1)} years of funding — a shortfall of {(OBLIGATION_YEARS - calc.yearsFunded).toFixed(1)} years. You'd need {Math.ceil(calc.unitsFor30)} units (≈{calc.hectaresNeeded.toFixed(1)} ha at the {yieldScenario === "yieldLow" ? "low" : yieldScenario === "yieldHigh" ? "high" : "mid-point"} yield) to reach 30 years.
            </div>
          )}
          {calc.reachable && calc.yearsFunded >= OBLIGATION_YEARS && (
            <div className="bng-flag ok">
              At {totalUnits} units in this profile, the bank funds the full 30-year obligation, with {(calc.yearsFunded - OBLIGATION_YEARS).toFixed(1)} years of headroom.
            </div>
          )}

          <div className="bng-chart-wrap">
            <div className="bng-chart-title">Years funded by total units on the bank (this profile's mix held constant)</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 6, right: 18, left: -14, bottom: 0 }}>
                <CartesianGrid stroke="var(--hairline)" strokeDasharray="2 4" />
                <XAxis dataKey="units" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} label={{ value: "total units", position: "insideBottom", offset: -3, fontSize: 11, fill: "var(--ink-soft)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                <Tooltip formatter={(v) => [`${v} yrs`, "Years funded"]} labelFormatter={(l) => `${l} units`} contentStyle={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, border: "1px solid var(--hairline)" }} />
                <ReferenceLine y={OBLIGATION_YEARS} stroke="var(--brick)" strokeDasharray="4 3" label={{ value: "30-yr obligation", position: "insideTopLeft", fontSize: 10.5, fill: "var(--brick)" }} />
                <ReferenceLine x={totalUnits} stroke="var(--dyke)" strokeDasharray="3 3" label={{ value: "current", position: "top", fontSize: 10.5, fill: "var(--dyke)" }} />
                <Line type="monotone" dataKey="years" stroke="var(--moss)" strokeWidth={2.25} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <button className="bng-assumptions-toggle" onClick={() => setShowAssumptions((v) => !v)}>
            {showAssumptions ? "Hide" : "Show"} model assumptions
          </button>

          {showAssumptions && (
            <div className="bng-assumptions">
              <p>Unit price points reference the Biodiversity Units UK Pricing Report, July 2026: <a href="https://www.biodiversityunits.com/july2026" target="_blank" rel="noopener noreferrer">biodiversityunits.com/july2026</a>.</p>
              <p>Establishment and ongoing habitat management costs are calculated from Arbtech's BNG creation &amp; maintenance cost guide (Grassland, Woodland, Scrub): <a href="https://arbtech.co.uk/wp-content/uploads/2024/04/BNG-Crib-Sheet-Landscape.pdf" target="_blank" rel="noopener noreferrer">arbtech.co.uk — BNG Crib Sheet</a>. Pond establishment: <a href="https://sasaquatics.com/cost-to-build-a-pond-in-devon-cornwall/" target="_blank" rel="noopener noreferrer">SAS Aquatics</a>, pond maintenance from the operator's own team day rate. Heathland establishment adapted from Cheshire Wildlife Trust's SMDA offsetting report, table 4.2; heathland ongoing management from Countryside Stewardship option LH1.</p>
              <p>Floodplain Wetland Mosaic splits establishment and ongoing cost across two different sources: establishment uses a low-end estimate of £50,000/ha for up-front capital works (scrapes, ponds, earthworks), while ongoing management cost is derived from the Countryside Stewardship CWT14 rate (£1,605/ha/yr) as a proxy for standing management, since no direct capital-cost source was found. Treat this category as the least evidenced in the model until real-world feedback firms it up.</p>
              <p>Unit yield per hectare for each habitat category has been broadly calculated as a blend between creation and enhancement of a spread of habitat types within that category. Unit values derived from The Statutory Metric: <a href="https://www.gov.uk/government/publications/statutory-biodiversity-metric-tools-and-guides" target="_blank" rel="noopener noreferrer">gov.uk — Statutory biodiversity metric tools and guides</a>.</p>
              <table>
                <thead>
                  <tr><th>Category</th><th>Price/unit</th><th>Yield low</th><th>Yield mid</th><th>Yield high</th></tr>
                </thead>
                <tbody>
                  {Object.values(HABITAT_DATA).map((d) => (
                    <tr key={d.label}>
                      <td>{d.label}</td>
                      <td className="bng-mono">{currency(d.price)}</td>
                      <td className="bng-mono">{d.yieldLow}</td>
                      <td className="bng-mono">{d.yieldAvg}</td>
                      <td className="bng-mono">{d.yieldHigh}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
