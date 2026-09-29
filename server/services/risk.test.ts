import { describe, expect, it } from "vitest";
import { evaluateLegacyAuthenticationRisk } from "./risk";

describe("evaluateLegacyAuthenticationRisk", () => {
  it("creates a critical response when Client ABC completion remains unverified", () => {
    const result = evaluateLegacyAuthenticationRisk(false, 87);
    expect(result.riskLevel).toBe("critical");
    expect(result.warningSeverity).toBe("critical");
    expect(result.confidence).toBe(87);
    expect(result.rationale).toContain("previously failed migration pattern");
  });

  it("changes the future result when verified OAuth completion exists", () => {
    const result = evaluateLegacyAuthenticationRisk(true, 87);
    expect(result.riskLevel).toBe("suggestion");
    expect(result.warningSeverity).toBe("suggestion");
    expect(result.title).toContain("mitigated");
    expect(result.recommendation).toContain("rollback");
  });
});
