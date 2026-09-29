import { and, desc, eq, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  conflicts,
  employees,
  events,
  evidence,
  failureFingerprints,
  fingerprintIncidents,
  incidents,
  knowledgeGaps,
  knowledgePatterns,
  memories,
  organizationSettings,
  projects,
  warnings,
} from "../../drizzle/schema";
import type { EventInput, MemoryInput } from "../../shared/handoff";
import { getDb } from "../db";
import { getMemoryService } from "./memory";
import { ensureDemoData } from "./seed";
import { evaluateLegacyAuthenticationRisk } from "./risk";

const publicId = (prefix: string) => `${prefix}_${nanoid(12)}`;

export type ProcessingResult = {
  eventId: string;
  riskLevel: "observe" | "suggestion" | "warning" | "critical";
  analysis: string;
  stages: string[];
  relatedMemories: { id: number; publicId: string; title: string; confidence: number; importance: string }[];
  warnings: { publicId: string; severity: string; title: string; confidence: number; status: string }[];
  evidenceUpdated: boolean;
  patternDetected: boolean;
};

function textIncludes(value: string, terms: string[]) {
  const normalized = value.toLowerCase();
  return terms.some(term => normalized.includes(term));
}

function isLegacyRemoval(input: EventInput) {
  const combined = `${input.component} ${input.description}`.toLowerCase();
  return combined.includes("legacy") && textIncludes(combined, ["remove", "delete", "retire", "decommission"]);
}

function isVerifiedClientMigration(input: EventInput) {
  const normalized = input.description.toLowerCase();
  return normalized.includes("client abc") && normalized.includes("completed migration") && normalized.includes("oauth");
}

export async function processAuthorizedEvent(input: EventInput): Promise<ProcessingResult> {
  await ensureDemoData();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");

  const [employee] = await db.select().from(employees).where(eq(employees.name, input.employee)).limit(1);
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.name, input.project), eq(projects.component, input.component)))
    .limit(1);

  if (!employee) throw new Error(`Unknown authorized employee: ${input.employee}`);
  if (!project) throw new Error(`Unknown authorized FinPay component: ${input.component}`);
  const [settings] = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, "finpay"))
    .limit(1);

  const eventPublicId = publicId("evt");
  const eventTimestamp = input.timestamp ? new Date(input.timestamp) : new Date();
  await db.insert(events).values({
    publicId: eventPublicId,
    eventType: input.eventType,
    employeeId: employee.id,
    projectId: project.id,
    component: input.component,
    description: input.description,
    metadata: JSON.stringify(input.metadata),
    eventTimestamp,
    processingStage: "OBSERVING",
    riskLevel: "observe",
    analysisSummary: "Observing authorized project activity.",
  });
  const [event] = await db.select().from(events).where(eq(events.publicId, eventPublicId)).limit(1);
  if (!event) throw new Error("Event persistence failed");

  if (!settings?.agentEnabled) {
    const analysis = "Background agent is paused by FinPay workspace settings. The authorized event was stored without analysis.";
    await db.update(events).set({ processingStage: "COMPLETE", analysisSummary: analysis }).where(eq(events.id, event.id));
    return { eventId: eventPublicId, riskLevel: "observe", analysis, stages: ["OBSERVING", "MONITORING"], relatedMemories: [], warnings: [], evidenceUpdated: false, patternDetected: false };
  }

  const stages = ["OBSERVING", "ANALYZING", "RECALLING", "EVALUATING", "MONITORING"];
  await db.update(events).set({ processingStage: "ANALYZING" }).where(eq(events.id, event.id));

  const memoryService = getMemoryService();
  const related = await memoryService.findRelatedMemories(input.description, input.component);
  const reflection = await memoryService.reflect(input.component);
  await db.update(events).set({ processingStage: "RECALLING" }).where(eq(events.id, event.id));

  let evidenceUpdated = false;
  let patternDetected = false;
  let riskLevel: ProcessingResult["riskLevel"] = "observe";
  let analysis = `Authorized activity was captured, recalled against ${reflection.memoryCount} component memories, and evaluated for organizational patterns and risk.`;
  const createdWarnings: ProcessingResult["warnings"] = [];

  // Every authorized action becomes a durable, source-attributed memory. This is not a UI-only activity row.
  const activityMemory: MemoryInput = {
    title: `${input.eventType.replace(/_/g, " ")} · ${input.component}`,
    memoryType: input.eventType.includes("INCIDENT") ? "Incident" : "Expert Knowledge",
    source: `Authorized event · ${input.employee}`,
    employee: input.employee,
    project: input.project,
    component: input.component,
    summary: input.description,
    historicalContext: "Captured by HandoffOS while observing authorized project activity.",
    importance: input.eventType === "PR_CREATED" ? "high" : "medium",
    confidence: 72,
    status: "current",
    tags: [input.eventType.toLowerCase(), input.component.toLowerCase().replace(/\s+/g, "-")],
  };
  if (settings?.memoryEnabled) await memoryService.remember({ ...activityMemory, eventId: event.id });

  // New verified evidence is persisted independently. Existing historical claims remain unchanged.
  if (isVerifiedClientMigration(input) && settings?.memoryEnabled) {
    evidenceUpdated = true;
    const evidenceMemory = await memoryService.remember({
      title: "Verified Client ABC OAuth migration completion",
      memoryType: "Evidence",
      source: `Authorized evidence · ${input.employee}`,
      employee: input.employee,
      project: input.project,
      component: "Customer Identity",
      summary: "Client ABC completed migration to OAuth.",
      historicalContext: "This newer verified evidence updates the current interpretation; it does not erase Maya's historical Legacy Auth claim or the historical incidents.",
      importance: "critical",
      confidence: 96,
      status: "current",
      tags: ["client-abc", "oauth", "verified", "migration"],
      eventId: event.id,
    });
    await db.insert(evidence).values({
      publicId: publicId("ev"),
      memoryId: evidenceMemory.id,
      eventId: event.id,
      source: `${input.employee} · authorized project evidence`,
      claim: "Client ABC completed migration to OAuth.",
      component: "Customer Identity",
      confidence: 96,
      evidenceStatus: "verified",
      observedAt: eventTimestamp,
    });

    const [clientConflict] = await db.select().from(conflicts).where(eq(conflicts.publicId, "conf_client_abc")).limit(1);
    if (clientConflict) {
      await db
        .update(conflicts)
        .set({
          currentClaim: "Client ABC completed migration to OAuth; historical Legacy Auth risk is preserved as context.",
          currentSource: `${input.employee} · authorized evidence`,
          currentConfidence: 96,
          evidenceSummary: "Verified completion evidence is now stronger than the earlier documentation and telemetry. Historical Maya notes and incidents #101/#142/#184 remain attached to the knowledge timeline.",
          status: "resolved",
        })
        .where(eq(conflicts.id, clientConflict.id));
    }

    await db
      .update(warnings)
      .set({ status: "mitigated" })
      .where(and(eq(warnings.component, "Legacy Authentication"), eq(warnings.severity, "critical"), eq(warnings.status, "active")));
    riskLevel = "suggestion";
    analysis = "Verified Client ABC migration evidence was remembered. Historical authentication failures remain visible, while the current action risk can now be reduced on reevaluation.";
  }

  // Knowledge Shadow detection uses persisted history. A similar observed pre-deploy check makes the stored shadow more confident.
  const identityCheck = input.component === "Customer Identity" && textIncludes(input.description, ["check", "verify", "review"]);
  if (identityCheck) {
    const [shadow] = await db.select().from(knowledgePatterns).where(eq(knowledgePatterns.publicId, "kp_maya_identity")).limit(1);
    if (shadow) {
      patternDetected = true;
      await db
        .update(knowledgePatterns)
        .set({ occurrenceCount: shadow.occurrenceCount + 1, confidence: Math.min(98, shadow.confidence + 1) })
        .where(eq(knowledgePatterns.id, shadow.id));
      riskLevel = riskLevel === "observe" ? "suggestion" : riskLevel;
      analysis = "A repeated pre-deployment identity check matched Maya's undocumented Knowledge Shadow and increased its stored confidence.";
    }
  }

  const unknownRestart = input.component === "Customer Identity" && textIncludes(input.description, ["restart", "cache"]);
  if (unknownRestart) {
    const [gap] = await db.select().from(knowledgeGaps).where(eq(knowledgeGaps.publicId, "kg_identity_cache")).limit(1);
    if (gap) {
      await db.update(knowledgeGaps).set({ occurrenceCount: gap.occurrenceCount + 1, status: "investigating" }).where(eq(knowledgeGaps.id, gap.id));
      riskLevel = riskLevel === "observe" ? "suggestion" : riskLevel;
      analysis = "Repeated cache-restart behavior matched an unresolved Unknown Knowledge record; the cause remains explicitly unverified.";
    }
  }

  const normalizedActivity = `${input.component} ${input.description}`.toLowerCase();
  const possibleConflict = normalizedActivity.includes("oauth") && normalizedActivity.includes("legacy");
  if (possibleConflict) {
    await memoryService.detectConflict({
      component: input.component,
      historicalClaim: "Historical organizational memory contains a Legacy Authentication dependency.",
      currentClaim: input.description,
      currentSource: `Authorized event · ${input.employee}`,
      confidence: 70,
      evidenceSummary: "HandoffOS retained both the historical claim and the newer authorized event for review.",
    });
  }

  const fridayDeployment = input.component === "Payment API" && normalizedActivity.includes("friday") && normalizedActivity.includes("deploy");
  if (fridayDeployment) {
    const [mutation] = await db.select().from(knowledgePatterns).where(eq(knowledgePatterns.publicId, "kp_friday_mutation")).limit(1);
    if (mutation) {
      await db.update(knowledgePatterns).set({ occurrenceCount: mutation.occurrenceCount + 1, status: "investigating" }).where(eq(knowledgePatterns.id, mutation.id));
      patternDetected = true;
      riskLevel = riskLevel === "observe" ? "suggestion" : riskLevel;
      analysis = "A Friday deployment matched a stored knowledge-mutation record; the original advisory guidance and current approval rule are both preserved for review.";
    }
  }

  const fingerprints = await db.select().from(failureFingerprints);
  const genericFingerprint = fingerprints.find(fingerprint => {
    if (fingerprint.publicId === "fp_legacy_auth" && isLegacyRemoval(input)) return false;
    const matches = fingerprint.criteria
      .split("|")
      .filter(term => normalizedActivity.includes(term.toLowerCase())).length;
    return matches >= 2;
  });
  if (genericFingerprint) {
    riskLevel = "suggestion";
    const warningPublicId = publicId("warn");
    await db.insert(warnings).values({
      publicId: warningPublicId,
      eventId: event.id,
      fingerprintId: genericFingerprint.id,
      severity: "suggestion",
      title: "Similar historical pattern detected",
      action: input.description,
      component: input.component,
      potentialImpact: genericFingerprint.consequence,
      confidence: genericFingerprint.confidence,
      reason: `Historical evidence suggests this activity resembles ${genericFingerprint.name}.`,
      recommendation: genericFingerprint.recommendation,
      evidenceSummary: genericFingerprint.pattern,
      status: "active",
    });
    createdWarnings.push({ publicId: warningPublicId, severity: "suggestion", title: "Similar historical pattern detected", confidence: genericFingerprint.confidence, status: "active" });
  }

  await db.update(events).set({ processingStage: "EVALUATING" }).where(eq(events.id, event.id));

  if (isLegacyRemoval(input)) {
    const [fingerprint] = await db
      .select()
      .from(failureFingerprints)
      .where(eq(failureFingerprints.publicId, "fp_legacy_auth"))
      .limit(1);
    if (fingerprint) {
      const verification = await db
        .select()
        .from(evidence)
        .where(and(eq(evidence.evidenceStatus, "verified"), like(evidence.claim, "%Client ABC completed migration to OAuth%")))
        .limit(1);
      const verifiedMigration = verification.length > 0;
      const evaluation = evaluateLegacyAuthenticationRisk(verifiedMigration, fingerprint.confidence);
      const incidentLinks = await db
        .select({ incidentNumber: incidents.incidentNumber })
        .from(fingerprintIncidents)
        .innerJoin(incidents, eq(fingerprintIncidents.incidentId, incidents.id))
        .where(eq(fingerprintIncidents.fingerprintId, fingerprint.id));
      const incidentNumbers = incidentLinks.map(item => `#${item.incidentNumber}`).join(", ");

      if (!verifiedMigration) {
        riskLevel = evaluation.riskLevel;
        analysis = `Historical Failure Fingerprint #17 matched. Similar Legacy Authentication changes caused enterprise login failures in incidents ${incidentNumbers}.`;
        const warningPublicId = publicId("warn");
        await db.insert(warnings).values({
          publicId: warningPublicId,
          eventId: event.id,
          fingerprintId: fingerprint.id,
          severity: evaluation.warningSeverity,
          title: evaluation.title,
          action: input.description,
          component: "Legacy Authentication",
          potentialImpact: "Customer authentication and enterprise client login failures.",
          confidence: evaluation.confidence,
          reason: evaluation.rationale,
          recommendation: evaluation.recommendation,
          evidenceSummary: `Failure Fingerprint #17 linked to incidents ${incidentNumbers}; historical consequence: customer login failures.`,
          status: "active",
        });
        createdWarnings.push({ publicId: warningPublicId, severity: evaluation.warningSeverity, title: evaluation.title, confidence: evaluation.confidence, status: "active" });
      } else {
        riskLevel = evaluation.riskLevel;
        analysis = `Historical Failure Fingerprint #17 still matches, but verified Client ABC OAuth completion changes the current risk assessment. Historical incidents ${incidentNumbers} remain available as context.`;
        const warningPublicId = publicId("warn");
        await db.insert(warnings).values({
          publicId: warningPublicId,
          eventId: event.id,
          fingerprintId: fingerprint.id,
          severity: evaluation.warningSeverity,
          title: evaluation.title,
          action: input.description,
          component: "Legacy Authentication",
          potentialImpact: "Historical authentication risk is reduced, not eliminated.",
          confidence: evaluation.confidence,
          reason: evaluation.rationale,
          recommendation: evaluation.recommendation,
          evidenceSummary: `Verified Client ABC OAuth completion plus historical incident context ${incidentNumbers}.`,
          status: "active",
        });
        createdWarnings.push({ publicId: warningPublicId, severity: evaluation.warningSeverity, title: evaluation.title, confidence: evaluation.confidence, status: "active" });
      }
    }
  }

  const deadEnd = textIncludes(`${input.component} ${input.description}`, ["redis", "locking"]);
  if (deadEnd) {
    riskLevel = riskLevel === "critical" ? "critical" : "warning";
    const warningPublicId = publicId("warn");
    await db.insert(warnings).values({
      publicId: warningPublicId,
      eventId: event.id,
      severity: "suggestion",
      title: "Previously failed approach detected",
      action: input.description,
      component: "Payment API",
      potentialImpact: "Historical concurrency contention during payment authorization.",
      confidence: 82,
      reason: "A similar Redis locking approach failed because of concurrency issues.",
      recommendation: "Use database-level locking, the documented alternative that stabilized authorization.",
      evidenceSummary: "Failure Fingerprint #22 and the Redis payment-lock post-incident review.",
      status: "active",
    });
    createdWarnings.push({ publicId: warningPublicId, severity: "suggestion", title: "Previously failed approach detected", confidence: 82, status: "active" });
  }

  await db
    .update(events)
    .set({ processingStage: "COMPLETE", riskLevel, analysisSummary: analysis })
    .where(eq(events.id, event.id));

  return {
    eventId: eventPublicId,
    riskLevel,
    analysis,
    stages,
    relatedMemories: related.map(memory => ({
      id: memory.id,
      publicId: memory.publicId,
      title: memory.title,
      confidence: memory.confidence,
      importance: memory.importance,
    })),
    warnings: createdWarnings,
    evidenceUpdated,
    patternDetected,
  };
}

export async function recentProcessingState() {
  await ensureDemoData();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [latest] = await db.select().from(events).orderBy(desc(events.createdAt)).limit(1);
  return latest ?? null;
}
