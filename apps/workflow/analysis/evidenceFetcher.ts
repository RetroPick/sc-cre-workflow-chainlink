/**
 * Evidence retrieval — thin wrapper delegating to DefaultEvidenceService.
 * Uses MockEvidenceProvider for v1; swap provider for real search later.
 */
import type { SourceObservation } from "../domain/candidate";
import type { UnderstandingOutput } from "../domain/understanding";
import type { EvidenceBundle } from "../domain/evidence";
import {
  createDefaultEvidenceService,
  MockEvidenceProvider,
} from "./evidence";

const defaultService = createDefaultEvidenceService(new MockEvidenceProvider());

export async function fetchEvidence(
  obs: SourceObservation,
  understanding: UnderstandingOutput
): Promise<EvidenceBundle> {
  return defaultService.fetch(obs, understanding);
}
