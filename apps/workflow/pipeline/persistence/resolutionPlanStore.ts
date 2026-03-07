/**
 * Resolution plan persistence for settlement-time lookup.
 * Per 03_SafetyComplienceLayer.md §11.4.
 * v1: in-memory store keyed by question hash; later pluggable (Firestore, DB).
 */
import type { ResolutionPlan } from "../../domain/resolutionPlan";
import { keccak256, toHex } from "viem";

const store = new Map<string, ResolutionPlan>();

function questionKey(question: string): string {
  const normalized = question.trim().toLowerCase();
  return keccak256(toHex(normalized));
}

/**
 * Save resolution plan for later lookup at settlement.
 * Call when draft is created or market is created from analysis.
 */
export function saveResolutionPlan(
  plan: ResolutionPlan,
  keys: { draftId?: string; question?: string }
): void {
  if (keys.draftId) {
    store.set(`draftId:${keys.draftId.toLowerCase()}`, plan);
  }
  if (keys.question) {
    store.set(`question:${questionKey(keys.question)}`, plan);
  }
}

/**
 * Get resolution plan for settlement.
 * Tries marketId first (when we have it from prior save), then question hash.
 */
export function getResolutionPlan(
  marketId?: string | number,
  question?: string
): ResolutionPlan | null {
  if (marketId !== undefined && marketId !== null) {
    const byMarket = store.get(`marketId:${marketId}`);
    if (byMarket) return byMarket;
  }
  if (question) {
    const byQuestion = store.get(`question:${questionKey(question)}`);
    if (byQuestion) return byQuestion;
  }
  return null;
}

/**
 * Associate a resolution plan with a marketId after market creation.
 * Call when marketId becomes known (e.g. from tx logs).
 */
export function associatePlanWithMarket(
  marketId: string | number,
  plan: ResolutionPlan
): void {
  store.set(`marketId:${marketId}`, plan);
}
