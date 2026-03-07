/**
 * Unresolved-state verification — ensures outcome is not already known.
 * Per 03_SafetyComplienceLayer: detects resolved/unresolved signals in evidence.
 */
import type { SourceObservation } from "../domain/candidate";
import type { UnderstandingOutput } from "../domain/understanding";
import type { EvidenceBundle } from "../domain/evidence";
import type { UnresolvedCheckResult } from "../domain/resolutionPlan";

const RESOLVED_SIGNAL_PATTERNS: RegExp[] = [
  /\bhas launched\b/i,
  /\bwas launched\b/i,
  /\bofficially launched\b/i,
  /\bannounced\b/i,
  /\breleased\b/i,
  /\bapproved\b/i,
  /\bpassed\b/i,
  /\bdeployed\b/i,
  /\blive now\b/i,
  /\bnow available\b/i,
];

const UNRESOLVED_SIGNAL_PATTERNS: RegExp[] = [
  /\brumor\b/i,
  /\bexpected\b/i,
  /\bplanned\b/i,
  /\bproposal\b/i,
  /\bconsidering\b/i,
  /\bmay launch\b/i,
  /\bnot yet\b/i,
  /\bno official announcement\b/i,
  /\bupcoming\b/i,
];

function textFromEvidence(evidence: EvidenceBundle): string[] {
  const all = [...evidence.primary, ...evidence.supporting, ...evidence.contradicting];
  return all.flatMap((e) => [e.label, e.excerpt ?? "", e.url]).filter(Boolean);
}

function collectMatches(texts: string[], patterns: RegExp[]): string[] {
  const matches: string[] = [];
  for (const t of texts) {
    for (const p of patterns) {
      if (p.test(t)) matches.push(`${p.source}:${t.slice(0, 160)}`);
    }
  }
  return matches;
}

function hasStrongOfficialResolvedEvidence(evidence: EvidenceBundle): boolean {
  return evidence.primary.some((e) => {
    const text = `${e.label} ${e.excerpt ?? ""}`.toLowerCase();
    return (
      e.trustScore >= 0.85 &&
      RESOLVED_SIGNAL_PATTERNS.some((p) => p.test(text))
    );
  });
}

function contradictionLevel(evidence: EvidenceBundle): number {
  const contradictCount = evidence.contradicting.length;
  if (contradictCount >= 3) return 1;
  if (contradictCount === 2) return 0.7;
  if (contradictCount === 1) return 0.4;
  return 0;
}

export function verifyUnresolvedState(
  observation: SourceObservation,
  understanding: UnderstandingOutput,
  evidence: EvidenceBundle
): UnresolvedCheckResult {
  const texts = textFromEvidence(evidence);
  const obsText = [observation.title, observation.body ?? ""].filter(Boolean).join(" ");
  if (obsText) texts.push(obsText);

  const resolvedMatches = collectMatches(texts, RESOLVED_SIGNAL_PATTERNS);
  const unresolvedMatches = collectMatches(texts, UNRESOLVED_SIGNAL_PATTERNS);

  const officialResolved = hasStrongOfficialResolvedEvidence(evidence);
  const contradiction = contradictionLevel(evidence);

  const evidenceLines: string[] = [];
  const matchedResolvedSignals: string[] = [];
  const matchedUnresolvedSignals: string[] = [];

  if (resolvedMatches.length > 0) {
    matchedResolvedSignals.push(...resolvedMatches.slice(0, 5));
    evidenceLines.push(`Resolved-like signals found: ${resolvedMatches.length}`);
  }

  if (unresolvedMatches.length > 0) {
    matchedUnresolvedSignals.push(...unresolvedMatches.slice(0, 5));
    evidenceLines.push(`Unresolved-like signals found: ${unresolvedMatches.length}`);
  }

  if (officialResolved) {
    evidenceLines.push("Strong official evidence suggests outcome may already be known");
  }

  if (contradiction > 0) {
    evidenceLines.push(`Contradiction score present: ${contradiction.toFixed(2)}`);
  }

  let passed = true;
  let requiresReview = false;
  let confidence = 0.8;

  if (officialResolved) {
    passed = false;
    confidence = 0.95;
  } else if (resolvedMatches.length >= 3 && unresolvedMatches.length === 0) {
    passed = false;
    confidence = 0.85;
  } else if (resolvedMatches.length > 0 && unresolvedMatches.length > 0) {
    passed = true;
    requiresReview = true;
    confidence = 0.55;
  } else if (contradiction >= 0.7) {
    passed = true;
    requiresReview = true;
    confidence = 0.5;
  }

  if (understanding.category === "unknown") {
    requiresReview = true;
    confidence = Math.min(confidence, 0.55);
    evidenceLines.push("Unknown category reduces unresolved-state confidence");
  }

  return {
    passed,
    confidence,
    evidence: evidenceLines,
    matchedResolvedSignals,
    matchedUnresolvedSignals,
    requiresReview,
  };
}

/** @deprecated Use verifyUnresolvedState. Kept for backward compat. */
export function verifyUnresolved(obs: SourceObservation): {
  passed: boolean;
  evidence: string[];
} {
  const result = verifyUnresolvedState(obs, {
    canonicalSubject: obs.title,
    eventType: obs.sourceType,
    category: "unknown",
    candidateQuestion: obs.title,
    marketType: "binary",
    entities: obs.entityHints ?? [],
    ambiguityScore: 0.5,
    marketabilityScore: 0.5,
  }, { primary: [], supporting: [], contradicting: [] });
  return { passed: result.passed, evidence: result.evidence };
}
