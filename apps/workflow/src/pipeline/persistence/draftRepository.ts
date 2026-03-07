/**
 * In-memory DraftRepository implementation for Market Drafting Pipeline (04).
 * v1: Map-based store. Pluggable for Firestore/DB later.
 */
import type { DraftRecord, DraftStatus } from "../../domain/draftRecord";
import type { DraftRepository } from "../creation/draftWriter";

const defaultStore = new Map<string, DraftRecord>();

let defaultInstance: DraftRepository | null = null;

/** Singleton for use by httpCallback, discoveryCron, draftProposer. */
export function getDefaultDraftRepository(): DraftRepository {
  if (!defaultInstance) {
    defaultInstance = createInMemoryDraftRepository();
  }
  return defaultInstance;
}

/**
 * Create in-memory DraftRepository.
 * @param store - Optional Map for test isolation. When omitted, uses shared default store.
 */
export function createInMemoryDraftRepository(customStore?: Map<string, DraftRecord>): DraftRepository {
  const s = customStore ?? defaultStore;
  return {
    async put(record: DraftRecord): Promise<void> {
      s.set(record.draftId.toLowerCase(), record);
    },

    async get(draftId: string): Promise<DraftRecord | null> {
      return s.get(draftId.toLowerCase()) ?? null;
    },

    async updateStatus(args: {
      draftId: string;
      status: DraftStatus;
      claimedAt?: number;
      publishedAt?: number;
      creator?: string;
      claimer?: string;
      marketId?: string;
      onchainDraftRef?: string;
    }): Promise<void> {
      const existing = s.get(args.draftId.toLowerCase());
      if (!existing) return;

      const updated: DraftRecord = {
        ...existing,
        status: args.status,
        ...(args.claimedAt !== undefined && { claimedAt: args.claimedAt }),
        ...(args.publishedAt !== undefined && { publishedAt: args.publishedAt }),
        ...(args.creator !== undefined && { creator: args.creator }),
        ...(args.claimer !== undefined && { claimer: args.claimer }),
        ...(args.marketId !== undefined && { marketId: args.marketId }),
        ...(args.onchainDraftRef !== undefined && { onchainDraftRef: args.onchainDraftRef }),
      };
      s.set(args.draftId.toLowerCase(), updated);
    },
  };
}
