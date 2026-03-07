/**
 * Unit tests for Privacy-Preserving Extensions (07_PrivacyPreservingExtensions.md).
 */
import { describe, it, expect } from "vitest";
import {
  requiresConfidentialFetch,
  requiresEligibilityCheck,
  requiresPrivateSettlement,
} from "../pipeline/privacy/privacyRouter";
import { applyControlledRelease } from "../pipeline/privacy/controlledRelease";
import { MockConfidentialEvidenceProvider } from "../pipeline/privacy/confidentialFetch";
import { MockEligibilityProvider } from "../pipeline/privacy/eligibilityCheck";
import { MockConfidentialSettlementProvider } from "../pipeline/privacy/privateSettlement";
import { makePrivacyAuditRecord } from "../pipeline/privacy/privacyAudit";
import type { PrivacyProfile } from "../domain/privacy";

describe("privacyRouter", () => {
  it("requiresConfidentialFetch returns true for PROTECTED_SOURCE and PRIVATE_INPUT", () => {
    expect(requiresConfidentialFetch("PROTECTED_SOURCE")).toBe(true);
    expect(requiresConfidentialFetch("PRIVATE_INPUT")).toBe(true);
  });

  it("requiresConfidentialFetch returns false for PUBLIC and COMPLIANCE_GATED", () => {
    expect(requiresConfidentialFetch("PUBLIC")).toBe(false);
    expect(requiresConfidentialFetch("COMPLIANCE_GATED")).toBe(false);
  });

  it("requiresEligibilityCheck returns true only for COMPLIANCE_GATED", () => {
    expect(requiresEligibilityCheck("COMPLIANCE_GATED")).toBe(true);
    expect(requiresEligibilityCheck("PUBLIC")).toBe(false);
    expect(requiresEligibilityCheck("PROTECTED_SOURCE")).toBe(false);
    expect(requiresEligibilityCheck("PRIVATE_INPUT")).toBe(false);
  });

  it("requiresPrivateSettlement returns true only for PRIVATE_INPUT", () => {
    expect(requiresPrivateSettlement("PRIVATE_INPUT")).toBe(true);
    expect(requiresPrivateSettlement("PUBLIC")).toBe(false);
    expect(requiresPrivateSettlement("PROTECTED_SOURCE")).toBe(false);
    expect(requiresPrivateSettlement("COMPLIANCE_GATED")).toBe(false);
  });
});

describe("applyControlledRelease", () => {
  it("ALLOW_DENY_ONLY extracts allowed and reasonCode", () => {
    const result = applyControlledRelease({
      policy: "ALLOW_DENY_ONLY",
      rawOutput: { allowed: true, reasonCode: "OK", secret: "x" },
    });
    expect(result.publicOutput).toEqual({ allowed: true, reasonCode: "OK" });
    expect(result.disclosurePolicy).toBe("ALLOW_DENY_ONLY");
  });

  it("SETTLEMENT_ONLY extracts outcomeIndex and confidenceBps", () => {
    const result = applyControlledRelease({
      policy: "SETTLEMENT_ONLY",
      rawOutput: { outcomeIndex: 1, confidenceBps: 9500, rawData: "secret" },
    });
    expect(result.publicOutput).toEqual({ outcomeIndex: 1, confidenceBps: 9500 });
  });

  it("HASH_ONLY outputs only outputHash when provided", () => {
    const result = applyControlledRelease({
      policy: "HASH_ONLY",
      rawOutput: { foo: "bar" },
      outputHash: "0xabc123",
    });
    expect(result.publicOutput).toEqual({ outputHash: "0xabc123" });
  });

  it("MINIMAL_DISCLOSURE passes through primitive values", () => {
    const result = applyControlledRelease({
      policy: "MINIMAL_DISCLOSURE",
      rawOutput: { a: 1, b: "x", c: true, d: { nested: 1 } },
    });
    expect(result.publicOutput).toEqual({ a: 1, b: "x", c: true });
  });
});

describe("MockConfidentialEvidenceProvider", () => {
  it("returns ControlledRelease with minimal publicOutput", async () => {
    const provider = new MockConfidentialEvidenceProvider();
    const result = await provider.fetchConfidential({
      queryType: "PREMIUM_RESEARCH",
      parameters: { subject: "ETH" },
      privacyProfile: "PROTECTED_SOURCE",
    });
    expect(result.publicOutput).toHaveProperty("status", "ok");
    expect(result.publicOutput).toHaveProperty("queryType", "PREMIUM_RESEARCH");
    expect(result.privateReferenceId).toMatch(/^privref:/);
    expect(result.outputHash).toBe("0xmock");
  });
});

describe("MockEligibilityProvider", () => {
  it("allows valid 0x wallet", async () => {
    const provider = new MockEligibilityProvider();
    const result = await provider.checkEligibility({
      wallet: "0x1234567890abcdef1234567890abcdef12345678",
      marketId: "m1",
      policyProfile: "RETROPICK_V1",
    });
    expect(result.allowed).toBe(true);
    expect(result.reasonCode).toBe("OK");
  });

  it("denies invalid wallet format", async () => {
    const provider = new MockEligibilityProvider();
    const result = await provider.checkEligibility({
      wallet: "invalid",
      marketId: "m1",
      policyProfile: "RETROPICK_V1",
    });
    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe("PROVIDER_ERROR");
  });
});

describe("MockConfidentialSettlementProvider", () => {
  it("returns ControlledRelease with SETTLEMENT_ONLY policy", async () => {
    const provider = new MockConfidentialSettlementProvider();
    const result = await provider.computeSettlement({
      marketId: "m1",
      resolutionPlanHash: "0xplan",
      inputRef: "ref",
    });
    expect(result.publicOutput.outcomeIndex).toBe(0);
    expect(result.publicOutput.confidenceBps).toBe(9500);
    expect(result.disclosurePolicy).toBe("SETTLEMENT_ONLY");
    expect(result.privateReferenceId).toMatch(/^settle:m1$/);
  });
});

describe("makePrivacyAuditRecord", () => {
  it("creates record with recordId and required fields", () => {
    const record = makePrivacyAuditRecord({
      marketId: "m1",
      workflowType: "ELIGIBILITY_CHECK",
      privacyProfile: "COMPLIANCE_GATED",
      providerType: "MockEligibilityProvider",
      actionTaken: "check",
      disclosedOutput: { allowed: true },
      privateReferenceId: "ref1",
    });
    expect(record.recordId).toBeDefined();
    expect(record.recordId.length).toBeGreaterThan(0);
    expect(record.marketId).toBe("m1");
    expect(record.workflowType).toBe("ELIGIBILITY_CHECK");
    expect(record.privacyProfile).toBe("COMPLIANCE_GATED");
    expect(record.providerType).toBe("MockEligibilityProvider");
    expect(record.actionTaken).toBe("check");
    expect(record.disclosedOutput).toEqual({ allowed: true });
    expect(record.privateReferenceId).toBe("ref1");
    expect(record.createdAt).toBeGreaterThan(0);
  });
});
