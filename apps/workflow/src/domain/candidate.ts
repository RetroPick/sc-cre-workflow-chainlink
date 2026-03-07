/**
 * Domain types for CRE Orchestration Layer.
 * SourceObservation is the canonical schema for market ideas from any source.
 */

import type { PrivacyProfile } from "./privacy";

export type SourceObservation = {
  sourceType: string;
  sourceId: string;
  externalId: string;
  observedAt: number;
  title: string;
  body?: string;
  url?: string;
  tags?: string[];
  entityHints?: string[];
  eventTime?: number;
  raw: unknown;
  /** Privacy profile for this observation. Defaults to PUBLIC when unset. */
  privacyProfile?: PrivacyProfile;
};
