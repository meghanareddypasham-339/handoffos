export type LegacyAuthRiskEvaluation = {
  riskLevel: "critical" | "suggestion";
  warningSeverity: "critical" | "suggestion";
  title: string;
  confidence: number;
  rationale: string;
  recommendation: string;
};

/**
 * Pure, explainable risk rule used after memory recall. The presence of verified
 * OAuth completion does not delete historical incidents; it changes the current
 * confidence and recommended response for the same proposed action.
 */
export function evaluateLegacyAuthenticationRisk(hasVerifiedClientMigration: boolean, fingerprintConfidence: number): LegacyAuthRiskEvaluation {
  if (!hasVerifiedClientMigration) {
    return {
      riskLevel: "critical",
      warningSeverity: "critical",
      title: "Historical failure pattern detected",
      confidence: fingerprintConfidence,
      rationale: "This change resembles a previously failed migration pattern. Historical evidence suggests a Client ABC verification gap can make legacy route removal unsafe.",
      recommendation: "Confirm enterprise client migration and a tested rollback path before deleting Legacy Authentication.",
    };
  }
  return {
    riskLevel: "suggestion",
    warningSeverity: "suggestion",
    title: "Historical pattern mitigated by new evidence",
    confidence: 72,
    rationale: "Similar historical failures remain relevant, but verified Client ABC OAuth completion reduces the previously missing migration evidence.",
    recommendation: "Retain a tested rollback plan and monitor authentication telemetry after the change.",
  };
}
