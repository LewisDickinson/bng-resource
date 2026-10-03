import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
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

// Broad Habitat categories per Natural England's published Statutory Biodiversity
// Metric (area-based habitats, plus Hedgerows and Watercourses as their own
// modules). Could not confirm against the project's actual v1.0.4 file — check
// this list against that file and correct if it differs.
const HABITAT_PRESETS = {
  cropland: { label: "Cropland", establishmentYears: 1, establishmentCostPerUnit: 500, ongoingCostPerUnit: 120 },
  grassland: { label: "Grassland", establishmentYears: 1, establishmentCostPerUnit: 800, ongoingCostPerUnit: 150 },
  heathland_shrub: { label: "Heathland and shrub", establishmentYears: 2, establishmentCostPerUnit: 700, ongoingCostPerUnit: 180 },
  lakes: { label: "Lakes", establishmentYears: 1, establishmentCostPerUnit: 1500, ongoingCostPerUnit: 120 },
  sparsely_vegetated: { label: "Sparsely vegetated land", establishmentYears: 1, establishmentCostPerUnit: 400, ongoingCostPerUnit: 60 },
  urban: { label: "Urban", establishmentYears: 1, establishmentCostPerUnit: 900, ongoingCostPerUnit: 140 },
  wetland: { label: "Wetland", establishmentYears: 2, establishmentCostPerUnit: 1200, ongoingCostPerUnit: 300 },
  woodland_forest: { label: "Woodland and forest", establishmentYears: 5, establishmentCostPerUnit: 2500, ongoingCostPerUnit: 220 },
  coastal: { label: "Coastal", establishmentYears: 2, establishmentCostPerUnit: 1600, ongoingCostPerUnit: 260 },
  hedgerows: { label: "Hedgerows", establishmentYears: 2, establishmentCostPerUnit: 600, ongoingCostPerUnit: 80 },
  watercourses: { label: "Watercourses", establishmentYears: 2, establishmentCostPerUnit: 1400, ongoingCostPerUnit: 280 },
  other: { label: "Other / custom", establishmentYears: 1, establishmentCostPerUnit: 500, ongoingCostPerUnit: 100 },
};

let idCounter = 1;
const nextId = () => idCounter++;

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

function makeHabitatRow(presetKey, customLabel = "") {
  const p = HABITAT_PRESETS[presetKey];
  return {
    id: nextId(),
    presetKey,
    customLabel,
    units: 20,
    price: 25000,
    establishmentYears: p.establishmentYears,
    establishmentCostPerUnit: p.establishmentCostPerUnit,
    ongoingCostPerUnit: p.ongoingCostPerUnit,
  };
}

function makeRoleRow(label, salary, headcount, type = "employed") {
  return { id: nextId(), label, salary, headcount, type };
}

export default function BNGEconomicsModelDetailed() {
  const [yearsUntilSale, setYearsUntilSale] = useState(0);
  const [upfrontCosts, setUpfrontCosts] = useState(15000);
  const [inflationPct, setInflationPct] = useState(3);
  const [overheadPerRole, setOverheadPerRole] = useState(12000);

  const [habitatRows, setHabitatRows] = useState([
    { ...makeHabitatRow("grassland", "Lowland meadow"), units: 30, price: 25000 },
    { ...makeHabitatRow("lakes", "Pond"), units: 8, price: 32000 },
  ]);
  const [roleRows, setRoleRows] = useState([
    makeRoleRow("Ranger / Monitoring Officer", 35000, 1),
  ]);

  const OBLIGATION_YEARS = 30;
  const growthFactor = 1 + inflationPct / 100;

  function updateHabitatRow(id, field, value) {
    setHabitatRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function changeHabitatPreset(id, presetKey) {
    const p = HABITAT_PRESETS[presetKey];
    setHabitatRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, presetKey, establishmentYears: p.establishmentYears, establishmentCostPerUnit: p.establishmentCostPerUnit, ongoingCostPerUnit: p.ongoingCostPerUnit }
          : r
      )
    );
  }
  function addHabitatRow() {
    setHabitatRows((prev) => [...prev, makeHabitatRow("grassland")]);
  }
  function removeHabitatRow(id) {
    setHabitatRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRoleRow(id, field, value) {
    setRoleRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function addRoleRow() {
    setRoleRows((prev) => [...prev, makeRoleRow("New role", 30000, 1)]);
  }
  function removeRoleRow(id) {
    setRoleRows((prev) => prev.filter((r) => r.id !== id));
  }

  const calc = useMemo(() => {
    const totalCurrentUnits = habitatRows.reduce((s, r) => s + r.units, 0);
    const roleCost = roleRows.reduce((s, r) => s + r.salary * r.headcount, 0);
    const totalHeadcount = roleRows.reduce((s, r) => s + r.headcount, 0);
    const employedHeadcount = roleRows.reduce((s, r) => s + (r.type !== "contractor" ? r.headcount : 0), 0);
    const overheadCost = overheadPerRole * employedHeadcount;

    function grossRevenueAtScale(scale) {
      return habitatRows.reduce((sum, r) => {
        const effPrice = r.price * Math.pow(growthFactor, yearsUntilSale);
        return sum + r.units * scale * effPrice;
      }, 0);
    }
    function habitatCostAtYearBuilder(scale) {
      return (year) =>
        habitatRows.reduce((sum, r) => {
          const u = r.units * scale;
          const estYears = Math.max(1, r.establishmentYears);
          const perYear = year <= r.establishmentYears ? r.establishmentCostPerUnit / estYears : r.ongoingCostPerUnit;
          return sum + u * perYear;
        }, 0);
    }
    function statsAtScale(scale) {
      const gross = grossRevenueAtScale(scale);
      const pot = Math.max(0, gross - upfrontCosts);
      const years = simulateYearsFunded({ pot, roleCost, overheadCost, habitatCostAtYear: habitatCostAtYearBuilder(scale), inflationPct });
      return { gross, pot, years };
    }

    const at1 = statsAtScale(1);

    let reachable = false;
    let scaleFor30 = null;
    let ceilingYears = 0;
    if (totalCurrentUnits > 0) {
      const CEILING_SCALE = 100000;
      ceilingYears = statsAtScale(CEILING_SCALE).years;
      reachable = ceilingYears >= OBLIGATION_YEARS;
      if (reachable) {
        let lo = 0, hi = CEILING_SCALE;
        for (let i = 0; i < 45; i++) {
          const mid = (lo + hi) / 2;
          const y = statsAtScale(mid).years;
          if (y < OBLIGATION_YEARS) lo = mid; else hi = mid;
        }
        scaleFor30 = hi;
      }
    }

    return {
      totalCurrentUnits, roleCost, overheadCost, totalHeadcount,
      grossRevenue: at1.gross, netPot: at1.pot, yearsFunded: at1.years,
      reachable, scaleFor30,
      unitsFor30: scaleFor30 !== null ? scaleFor30 * totalCurrentUnits : null,
      ceilingYears,
    };
  }, [habitatRows, roleRows, overheadPerRole, inflationPct, yearsUntilSale, upfrontCosts, growthFactor]);

  const chartData = useMemo(() => {
    if (calc.totalCurrentUnits <= 0) return [];
    const roleCost = calc.roleCost;
    const overheadCost = calc.overheadCost;
    const maxScale = calc.reachable ? Math.max(2.5, calc.scaleFor30 * 1.4) : 6;
    const steps = 40;
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const scale = (maxScale * i) / steps;
      const gross = habitatRows.reduce((sum, r) => {
        const effPrice = r.price * Math.pow(growthFactor, yearsUntilSale);
        return sum + r.units * scale * effPrice;
      }, 0);
      const pot = Math.max(0, gross - upfrontCosts);
      const habitatCostAtYear = (year) =>
        habitatRows.reduce((sum, r) => {
          const u = r.units * scale;
          const estYears = Math.max(1, r.establishmentYears);
          const perYear = year <= r.establishmentYears ? r.establishmentCostPerUnit / estYears : r.ongoingCostPerUnit;
          return sum + u * perYear;
        }, 0);
      const years = simulateYearsFunded({ pot, roleCost, overheadCost, habitatCostAtYear, inflationPct });
      points.push({ units: Math.round(scale * calc.totalCurrentUnits), years: Math.round(years * 10) / 10 });
    }
    return points;
  }, [habitatRows, calc.totalCurrentUnits, calc.reachable, calc.scaleFor30, calc.roleCost, calc.overheadCost, growthFactor, yearsUntilSale, upfrontCosts, inflationPct]);

  function exportToExcel() {
    const wb = XLSX.utils.book_new();

    const settingsData = [
      ["Setting", "Value"],
      ["Est years until all units are sold", yearsUntilSale],
      ["Up-front set-up costs (£)", upfrontCosts],
      ["Annual cost inflation (%)", inflationPct],
      ["Overhead per head, annual (£)", overheadPerRole],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(settingsData), "Bank-wide settings");

    const habitatHeader = ["Broad Habitat", "Habitat Type", "Units", "Price per unit today (£)", "Establishment years", "Establishment £/unit (total)", "Ongoing £/unit/yr"];
    const habitatData = [
      habitatHeader,
      ...habitatRows.map((r) => [
        HABITAT_PRESETS[r.presetKey].label,
        r.customLabel || "",
        r.units,
        r.price,
        r.establishmentYears,
        r.establishmentCostPerUnit,
        r.ongoingCostPerUnit,
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(habitatData), "Habitat mix");

    const roleHeader = ["Type", "Role", "Annual cost, £ (salary inc. on-costs & pension, or all-inclusive contract cost)", "Headcount"];
    const roleData = [roleHeader, ...roleRows.map((r) => [r.type === "contractor" ? "Contractor" : "Employed", r.label, r.salary, r.headcount])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(roleData), "Team and roles");

    const resultsData = [
      ["Metric", "Value"],
      ["Total current units", calc.totalCurrentUnits],
      ["Gross revenue, inflation-adjusted price (£)", Math.round(calc.grossRevenue)],
      ["Net pot after set-up costs (£)", Math.round(calc.netPot)],
      ["Years funded", Math.round(calc.yearsFunded * 10) / 10],
      ["Reaches 30-year obligation?", calc.reachable && calc.yearsFunded >= OBLIGATION_YEARS ? "Yes" : "No"],
      ["Scale factor needed for 30 yrs (same mix)", calc.reachable ? Math.round(calc.scaleFor30 * 100) / 100 : "Not reachable by scaling"],
      ["Total units needed for 30 yrs (same mix)", calc.reachable ? Math.ceil(calc.unitsFor30) : "Not reachable by scaling"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resultsData), "Results");

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bng-economics-model-detailed-export.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

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
        .bng-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 3px; }
        .bng-h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 20px; margin: 0 0 3px; }
        .bng-h2 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 15.5px; margin: 0 0 3px; }
        .bng-sub { color: var(--ink-soft); font-size: 12.5px; margin-bottom: 18px; }
        .bng-mono { font-family: 'IBM Plex Mono', monospace; }

        .bng-export-btn { background: var(--moss); color: var(--paper-raised); border: none; padding: 9px 16px; font-size: 12.5px; font-weight: 500; border-radius: 2px; font-family: inherit; cursor: pointer; white-space: nowrap; }
        .bng-export-btn:hover { background: var(--moss-dark); }

        .bng-section { margin-bottom: 22px; }
        .bng-section-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }

        .bng-panel { background: var(--paper-raised); border: 1px solid var(--hairline); border-radius: 3px; padding: 16px; }
        .bng-settings-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        @media (max-width: 700px) { .bng-settings-grid { grid-template-columns: 1fr; } }

        .bng-field { margin-bottom: 0; }
        .bng-label { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-soft); margin-bottom: 6px; }
        .bng-label .val { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; color: var(--ink); text-transform: none; letter-spacing: 0; }
        input[type="range"] { width: 100%; accent-color: var(--moss); cursor: pointer; }
        input[type="number"], input[type="text"] { padding: 7px 9px; border: 1px solid var(--hairline); background: var(--paper); font-family: 'IBM Plex Mono', monospace; font-size: 13px; border-radius: 2px; color: var(--ink); width: 100%; }
        select { width: 100%; padding: 7px 9px; border: 1px solid var(--hairline); background: var(--paper); font-family: inherit; font-size: 13px; border-radius: 2px; color: var(--ink); }
        .bng-note { font-size: 11.5px; color: var(--ink-soft); margin-top: 6px; }

        .bng-row-card { border: 1px solid var(--hairline); background: var(--paper-raised); border-radius: 3px; padding: 12px 14px; margin-bottom: 10px; }
        .bng-row-grid-habitat { display: grid; grid-template-columns: 1.1fr 1.3fr 0.7fr 0.9fr 0.8fr 0.9fr 0.9fr auto; gap: 10px; align-items: end; }
        @media (max-width: 1000px) { .bng-row-grid-habitat { grid-template-columns: 1fr 1fr; } }
        .bng-row-grid-role { display: grid; grid-template-columns: 0.9fr 1.4fr 1.2fr 0.7fr auto; gap: 10px; align-items: end; }
        @media (max-width: 640px) { .bng-row-grid-role { grid-template-columns: 1fr 1fr; } }
        .bng-row-grid-habitat label, .bng-row-grid-role label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-soft); margin-bottom: 4px; }
        .bng-row-label-input { font-family: 'IBM Plex Sans', sans-serif !important; }

        .bng-add-btn { background: none; border: 1px dashed var(--hairline); color: var(--ink-soft); font-size: 12.5px; padding: 9px 14px; border-radius: 2px; font-family: inherit; cursor: pointer; width: 100%; text-align: center; }
        .bng-add-btn:hover { border-color: var(--moss); color: var(--moss-dark); }
        .bng-remove-btn { background: none; border: 1px solid var(--hairline); color: var(--ink-soft); font-size: 11px; padding: 7px 9px; border-radius: 2px; font-family: inherit; cursor: pointer; height: fit-content; white-space: nowrap; }
        .bng-remove-btn:hover { border-color: var(--brick); color: var(--brick); }

        .bng-overhead-field { max-width: 260px; margin-bottom: 14px; }

        .bng-stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
        @media (max-width: 560px) { .bng-stat-row { grid-template-columns: 1fr 1fr; } }
        .bng-stat { border: 1px solid var(--hairline); background: var(--paper-raised); padding: 12px 14px; border-radius: 3px; }
        .bng-stat .num { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 600; line-height: 1.1; }
        .bng-stat .lab { font-size: 11px; color: var(--ink-soft); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
        .bng-stat.warn .num { color: var(--brick); }
        .bng-stat.ok .num { color: var(--moss-dark); }

        .bng-flag { border-left: 3px solid var(--amber); background: #F4E6D3; padding: 10px 14px; font-size: 13px; border-radius: 2px; margin-bottom: 12px; }
        .bng-flag.brick { border-left-color: var(--brick); background: #F2DCDC; }
        .bng-flag.ok { border-left-color: var(--moss); background: #E4E9DD; }
        .bng-flag.dyke { border-left-color: var(--dyke); background: #E3ECEF; }

        .bng-chart-wrap { border: 1px solid var(--hairline); background: var(--paper-raised); border-radius: 3px; padding: 14px 14px 6px; }
        .bng-chart-title { font-size: 12.5px; color: var(--ink-soft); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
      `}</style>

      <div className="bng-top">
        <div>
          <div className="bng-h1">BNG economics model - detailed</div>
          <div className="bng-sub" style={{ marginBottom: 0 }}>A mixed habitat bank's unit revenue, net of set-up costs, set against a shared team's cost stack — inflating together — to see how many years of funding it buys against the 30-year obligation.</div>
        </div>
        <button className="bng-export-btn" onClick={exportToExcel}>Export data (.xlsx)</button>
      </div>
      <div style={{ height: 14 }} />

      <div className="bng-section bng-panel">
        <div className="bng-h2" style={{ marginBottom: 10 }}>Bank-wide settings</div>
        <div className="bng-settings-grid">
          <div className="bng-field">
            <div className="bng-label"><span>Est Years Until All Units Are Sold</span><span className="val">{yearsUntilSale}</span></div>
            <input type="range" min="0" max="15" value={yearsUntilSale} onChange={(e) => setYearsUntilSale(+e.target.value)} />
            <div className="bng-note">Unit prices below inflate forward by this many years before sale.</div>
          </div>
          <div className="bng-field">
            <div className="bng-label"><span>Up-front set-up costs</span></div>
            <input type="number" min="0" step="500" value={upfrontCosts} onChange={(e) => setUpfrontCosts(Math.max(0, +e.target.value))} />
            <div className="bng-note">Legal, Responsible Body payment, offsite register fee, etc — one-off, deducted before the annual stack starts.</div>
          </div>
          <div className="bng-field">
            <div className="bng-label"><span>Annual cost inflation</span><span className="val">{inflationPct}%</span></div>
            <input type="range" min="0" max="8" step="0.5" value={inflationPct} onChange={(e) => setInflationPct(+e.target.value)} />
            <div className="bng-note">Applies to salaries, overhead, habitat costs, and unit price alike.</div>
          </div>
        </div>
      </div>

      <div className="bng-section">
        <div className="bng-section-head">
          <div className="bng-h2">Habitat mix</div>
          <span className="bng-note bng-mono">{calc.totalCurrentUnits} units total</span>
        </div>
        {habitatRows.map((r) => (
          <div className="bng-row-card" key={r.id}>
            <div className="bng-row-grid-habitat">
              <div>
                <label>Broad Habitat</label>
                <select value={r.presetKey} onChange={(e) => changeHabitatPreset(r.id, e.target.value)}>
                  {Object.entries(HABITAT_PRESETS).map(([k, p]) => (<option key={k} value={k}>{p.label}</option>))}
                </select>
              </div>
              <div>
                <label>Habitat Type (Lowland meadow, ONG, Broadleaved Woodland, etc)</label>
                <input type="text" value={r.customLabel} onChange={(e) => updateHabitatRow(r.id, "customLabel", e.target.value)} />
              </div>
              <div>
                <label>Units</label>
                <input type="number" min="0" value={r.units} onChange={(e) => updateHabitatRow(r.id, "units", Math.max(0, +e.target.value))} />
              </div>
              <div>
                <label>Price/unit (today)</label>
                <input type="number" min="0" step="500" value={r.price} onChange={(e) => updateHabitatRow(r.id, "price", Math.max(0, +e.target.value))} />
              </div>
              <div>
                <label>Establishment yrs</label>
                <input type="number" min="0" max="15" value={r.establishmentYears} onChange={(e) => updateHabitatRow(r.id, "establishmentYears", Math.max(0, +e.target.value))} />
              </div>
              <div>
                <label>Establishment £/unit</label>
                <input type="number" min="0" step="50" value={r.establishmentCostPerUnit} onChange={(e) => updateHabitatRow(r.id, "establishmentCostPerUnit", Math.max(0, +e.target.value))} />
              </div>
              <div>
                <label>Ongoing £/unit/yr</label>
                <input type="number" min="0" step="10" value={r.ongoingCostPerUnit} onChange={(e) => updateHabitatRow(r.id, "ongoingCostPerUnit", Math.max(0, +e.target.value))} />
              </div>
              <button className="bng-remove-btn" onClick={() => removeHabitatRow(r.id)}>Remove</button>
            </div>
          </div>
        ))}
        <button className="bng-add-btn" onClick={addHabitatRow}>+ Add habitat</button>
      </div>

      <div className="bng-section">
        <div className="bng-section-head">
          <div className="bng-h2">Team &amp; roles</div>
          <span className="bng-note bng-mono">{calc.totalHeadcount} head{calc.totalHeadcount === 1 ? "" : "s"} total</span>
        </div>
        <div className="bng-field bng-overhead-field">
          <div className="bng-label"><span>Overhead, per head (annual)</span><span className="val">{currency(overheadPerRole)}</span></div>
          <input type="range" min="0" max="30000" step="500" value={overheadPerRole} onChange={(e) => setOverheadPerRole(+e.target.value)} />
          <div className="bng-note">Flat rate applied per employed head — equipment, admin, vehicle/office share. Doesn't apply to contractors, whose rate is assumed to include their own overhead.</div>
        </div>
        {roleRows.map((r) => (
          <div className="bng-row-card" key={r.id}>
            <div className="bng-row-grid-role">
              <div>
                <label>Type</label>
                <select value={r.type} onChange={(e) => updateRoleRow(r.id, "type", e.target.value)}>
                  <option value="employed">Employed</option>
                  <option value="contractor">Contractor</option>
                </select>
              </div>
              <div>
                <label>Role</label>
                <input className="bng-row-label-input" type="text" value={r.label} onChange={(e) => updateRoleRow(r.id, "label", e.target.value)} />
              </div>
              <div>
                <label>{r.type === "contractor" ? "Annual contract cost (all-inclusive)" : "Full salary inc. on-costs, pension, etc"}</label>
                <input type="number" min="0" step="500" value={r.salary} onChange={(e) => updateRoleRow(r.id, "salary", Math.max(0, +e.target.value))} />
              </div>
              <div>
                <label>Headcount</label>
                <input type="number" min="0" value={r.headcount} onChange={(e) => updateRoleRow(r.id, "headcount", Math.max(0, +e.target.value))} />
              </div>
              <button className="bng-remove-btn" onClick={() => removeRoleRow(r.id)}>Remove</button>
            </div>
          </div>
        ))}
        <button className="bng-add-btn" onClick={addRoleRow}>+ Add role</button>
      </div>

      <div className="bng-section">
        <div className="bng-stat-row">
          <div className="bng-stat">
            <div className="num bng-mono">{currency(calc.netPot)}</div>
            <div className="lab">Net pot (inflation-adj. price, after set-up costs)</div>
          </div>
          <div className={`bng-stat ${calc.yearsFunded >= OBLIGATION_YEARS ? "ok" : "warn"}`}>
            <div className="num bng-mono">{calc.yearsFunded >= 200 ? "200+" : calc.yearsFunded.toFixed(1)}</div>
            <div className="lab">Years funded ({calc.totalHeadcount} head{calc.totalHeadcount === 1 ? "" : "s"})</div>
          </div>
          <div className="bng-stat">
            <div className="num bng-mono">{calc.reachable ? Math.ceil(calc.unitsFor30) : "—"}</div>
            <div className="lab">Total units needed for 30 yrs (same mix)</div>
          </div>
        </div>

        {calc.totalCurrentUnits <= 0 && (
          <div className="bng-flag">Add at least one habitat row with units greater than 0 to see the model calculate.</div>
        )}
        {calc.totalCurrentUnits > 0 && !calc.reachable && (
          <div className="bng-flag brick">
            30 years isn't reachable by scaling this mix up alone — even at 100,000× the current size, years funded plateaus at roughly {calc.ceilingYears.toFixed(1)}. Ongoing habitat cost scales with units at the same rate as revenue, so past a point extra units mostly cover their own upkeep. The lever that moves this is price, the price/ongoing-cost ratio, or the fixed team cost — not bank size.
          </div>
        )}
        {calc.totalCurrentUnits > 0 && calc.reachable && calc.yearsFunded < OBLIGATION_YEARS && (
          <div className="bng-flag brick">
            At this mix and team, {calc.totalCurrentUnits} units funds {calc.yearsFunded.toFixed(1)} years — a shortfall of {(OBLIGATION_YEARS - calc.yearsFunded).toFixed(1)} years. Scaling the whole mix up by {calc.scaleFor30.toFixed(2)}× (≈{Math.ceil(calc.unitsFor30)} total units, same proportions) would reach 30 years.
          </div>
        )}
        {calc.totalCurrentUnits > 0 && calc.reachable && calc.yearsFunded >= OBLIGATION_YEARS && (
          <div className="bng-flag ok">
            At this mix and team, {calc.totalCurrentUnits} units funds the full 30-year obligation, with {(calc.yearsFunded - OBLIGATION_YEARS).toFixed(1)} years of headroom.
          </div>
        )}

        <div className="bng-flag dyke">
          Year 1 fixed team cost: {currency(calc.roleCost)} salaries + {currency(calc.overheadCost)} overhead, before habitat delivery cost across {habitatRows.length} habitat row{habitatRows.length === 1 ? "" : "s"} is added on top — see chart below for how the combined total evolves as inflation compounds it. Gross revenue {currency(calc.grossRevenue)}, less {currency(upfrontCosts)} set-up, leaves the net pot above.
        </div>

        {calc.totalCurrentUnits > 0 && (
          <div className="bng-chart-wrap">
            <div className="bng-chart-title">Years funded as this mix scales up or down (proportions held constant)</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 6, right: 18, left: -14, bottom: 0 }}>
                <CartesianGrid stroke="var(--hairline)" strokeDasharray="2 4" />
                <XAxis dataKey="units" tick={{ fontSize: 11, fill: "var(--ink-soft)" }} label={{ value: "total units", position: "insideBottom", offset: -3, fontSize: 11, fill: "var(--ink-soft)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--ink-soft)" }} />
                <Tooltip formatter={(v) => [`${v} yrs`, "Years funded"]} labelFormatter={(l) => `${l} units`} contentStyle={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, border: "1px solid var(--hairline)" }} />
                <ReferenceLine y={OBLIGATION_YEARS} stroke="var(--brick)" strokeDasharray="4 3" label={{ value: "30-yr obligation", position: "insideTopLeft", fontSize: 10.5, fill: "var(--brick)" }} />
                <ReferenceLine x={calc.totalCurrentUnits} stroke="var(--dyke)" strokeDasharray="3 3" label={{ value: "current", position: "top", fontSize: 10.5, fill: "var(--dyke)" }} />
                <Line type="monotone" dataKey="years" stroke="var(--moss)" strokeWidth={2.25} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
