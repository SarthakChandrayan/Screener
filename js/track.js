// Track record: every buy plan is saved (once per day per risk level) with that day's prices,
// so the TRACK page can later show how the picks did against simply holding the Nifty 50.

import { store } from "./util.js";

const KEY = "bahi-track-v1", MAX = 200;

export const getPlans = () => store.get(KEY, []);
export const clearPlans = () => store.set(KEY, []);

export function savePlan({ risk, riskName, picks, nifty }) {
  if (!picks.length || !(nifty > 0) || picks.some(p => !(p.price > 0))) return false;
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
  const plans = getPlans();
  if (plans.some(p => p.day === day && p.risk === risk)) return false;
  const tot = picks.reduce((a, p) => a + p.w, 0) || 1;
  plans.push({ day, at: Date.now(), risk, riskName, nifty, picks: picks.map(p => ({ sym: p.sym, name: p.name, price: p.price, w: p.w / tot })) });
  store.set(KEY, plans.slice(-MAX));
  return true;
}
