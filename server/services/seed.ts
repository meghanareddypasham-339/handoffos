import { count, eq } from "drizzle-orm";
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
import { getDb } from "../db";

const id = (prefix: string) => `${prefix}_${nanoid(12)}`;
const date = (value: string) => new Date(value);

let seedPromise: Promise<void> | null = null;

/**
 * Creates a rich FinPay domain only once. The existence check deliberately avoids
 * overwriting user-authored memories, warnings, settings, or later demo actions.
 */
export async function ensureDemoData(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedFinPay().catch(error => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}

async function seedFinPay(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable; HandoffOS cannot load organizational memory.");

  const existing = await db.select({ id: projects.id }).from(projects).where(eq(projects.name, "FinPay")).limit(1);
  if (existing.length > 0) {
    await ensureSeedEnrichment();
    return;
  }

  await db.insert(employees).values([
    {
      name: "Maya",
      role: "Senior Backend Engineer",
      team: "Platform Engineering",
      profileSummary: "Long-term owner of payment deployment safety, authentication migrations, and customer identity edge cases.",
    },
    {
      name: "Arjun",
      role: "Backend Engineer",
      team: "Platform Engineering",
      profileSummary: "New owner of payment and authentication changes following Maya's handoff.",
    },
    {
      name: "Leah",
      role: "Site Reliability Engineer",
      team: "Reliability",
      profileSummary: "Incident response partner for production payment and identity services.",
    },
  ]);

  const employeeRows = await db.select().from(employees);
  const maya = employeeRows.find(row => row.name === "Maya");
  const arjun = employeeRows.find(row => row.name === "Arjun");
  const leah = employeeRows.find(row => row.name === "Leah");
  if (!maya || !arjun || !leah) throw new Error("Failed to establish FinPay employee records.");

  await db.insert(projects).values([
    {
      name: "FinPay",
      component: "Payment API",
      description: "Authorization, captures, refunds, and production deployment workflow.",
      criticality: "critical",
      ownerEmployeeId: maya.id,
    },
    {
      name: "FinPay",
      component: "Legacy Authentication",
      description: "Compatibility gateway for legacy client authentication and token routing.",
      criticality: "critical",
      ownerEmployeeId: maya.id,
    },
    {
      name: "FinPay",
      component: "Customer Identity",
      description: "Client migration status and identity configuration service.",
      criticality: "high",
      ownerEmployeeId: maya.id,
    },
    {
      name: "FinPay",
      component: "Billing Service",
      description: "Invoices, subscriptions, and reconciliation workflows.",
      criticality: "high",
      ownerEmployeeId: arjun.id,
    },
    {
      name: "FinPay",
      component: "Notification Service",
      description: "Customer alerts and internal incident notifications.",
      criticality: "medium",
      ownerEmployeeId: leah.id,
    },
  ]);

  const projectRows = await db.select().from(projects).where(eq(projects.name, "FinPay"));
  const projectByComponent = new Map(projectRows.map(project => [project.component, project]));
  const paymentApi = projectByComponent.get("Payment API")!;
  const legacyAuth = projectByComponent.get("Legacy Authentication")!;
  const customerIdentity = projectByComponent.get("Customer Identity")!;
  const billing = projectByComponent.get("Billing Service")!;
  const notifications = projectByComponent.get("Notification Service")!;

  const incidentSeed = [
    ["101", "Client login failures after legacy route removal", "critical", legacyAuth.id, "Legacy Authentication", "Enterprise customers were unable to authenticate for 41 minutes.", "Legacy dependency removed before all enterprise migrations were verified.", "2025-03-11T09:10:00Z"],
    ["118", "Payment capture retries duplicated notifications", "high", paymentApi.id, "Notification Service", "Customers received duplicate payment receipt emails.", "Retry queue lacked idempotency key propagation.", "2025-05-08T14:05:00Z"],
    ["142", "Migration rollback unavailable during auth cutover", "critical", legacyAuth.id, "Legacy Authentication", "Customer login failures persisted until manual routing restoration.", "Database migration and legacy dependency removal occurred without a tested rollback.", "2025-07-22T17:20:00Z"],
    ["156", "Billing reconciliation paused after schema drift", "high", billing.id, "Billing Service", "Reconciliation lagged by five hours.", "A hidden downstream export depended on a renamed billing column.", "2025-08-15T10:45:00Z"],
    ["171", "Identity cache restart required after deploy", "medium", customerIdentity.id, "Customer Identity", "New OAuth scopes did not appear until cache restart.", "Stale identity configuration cache retained prior scope map.", "2025-09-04T11:30:00Z"],
    ["184", "Legacy Auth removal blocked Client ABC", "critical", legacyAuth.id, "Legacy Authentication", "Client ABC and two enterprise accounts could not sign in after migration.", "Legacy token fallback was removed before an account-specific migration confirmation.", "2025-11-14T16:40:00Z"],
    ["193", "Friday payment deployment elevated queue latency", "medium", paymentApi.id, "Payment API", "Settlement processing latency exceeded SLO during weekend batch overlap.", "Friday release overlapped with a high-volume reconciliation window.", "2026-01-09T18:15:00Z"],
    ["207", "Redis payment lock experiment caused contention", "high", paymentApi.id, "Payment API", "Payment authorization throughput fell during peak load.", "Distributed lock lease contention produced orphaned lock delays.", "2026-02-18T13:00:00Z"],
  ] as const;

  await db.insert(incidents).values(
    incidentSeed.map(([incidentNumber, title, severity, projectId, component, consequence, rootCause, occurredAt]) => ({
      incidentNumber,
      title,
      severity,
      projectId,
      component,
      consequence,
      rootCause,
      occurredAt: date(occurredAt),
      resolvedAt: date(occurredAt),
    }))
  );

  const incidentRows = await db.select().from(incidents);
  const incidentByNumber = new Map(incidentRows.map(incident => [incident.incidentNumber, incident]));

  const fingerprintSeed = [
    {
      publicId: "fp_legacy_auth",
      name: "Failure Fingerprint #17 · Legacy Auth Cutover",
      pattern: "Legacy dependency + customer migration + no verified rollback = historical production failure",
      criteria: "legacy authentication|remove|migration|rollback|Client ABC",
      component: "Legacy Authentication",
      severity: "critical" as const,
      occurrenceCount: 3,
      confidence: 87,
      consequence: "Customer login failures for enterprise accounts.",
      recommendation: "Confirm enterprise client migration and a tested rollback path before deleting Legacy Authentication.",
    },
    {
      publicId: "fp_payment_deploy",
      name: "Failure Fingerprint #08 · Friday Settlement Window",
      pattern: "Friday payment deployment + reconciliation window = elevated settlement latency",
      criteria: "friday|deployment|payment|settlement",
      component: "Payment API",
      severity: "high" as const,
      occurrenceCount: 2,
      confidence: 78,
      consequence: "Settlement processing latency and customer support impact.",
      recommendation: "Schedule outside settlement windows or staff an explicit rollback owner.",
    },
    {
      publicId: "fp_redis_lock",
      name: "Failure Fingerprint #22 · Redis Lock Contention",
      pattern: "Redis payment locking + concurrency spike = authorization contention",
      criteria: "redis|locking|payment|concurrency",
      component: "Payment API",
      severity: "high" as const,
      occurrenceCount: 2,
      confidence: 82,
      consequence: "Authorization throughput degradation during peak load.",
      recommendation: "Prefer database-level locking for payment authorization critical sections.",
    },
  ];
  await db.insert(failureFingerprints).values(fingerprintSeed);
  const fingerprintRows = await db.select().from(failureFingerprints);
  const legacyFingerprint = fingerprintRows.find(row => row.publicId === "fp_legacy_auth")!;
  const fridayFingerprint = fingerprintRows.find(row => row.publicId === "fp_payment_deploy")!;
  const redisFingerprint = fingerprintRows.find(row => row.publicId === "fp_redis_lock")!;

  await db.insert(fingerprintIncidents).values([
    { fingerprintId: legacyFingerprint.id, incidentId: incidentByNumber.get("101")!.id },
    { fingerprintId: legacyFingerprint.id, incidentId: incidentByNumber.get("142")!.id },
    { fingerprintId: legacyFingerprint.id, incidentId: incidentByNumber.get("184")!.id },
    { fingerprintId: fridayFingerprint.id, incidentId: incidentByNumber.get("193")!.id },
    { fingerprintId: redisFingerprint.id, incidentId: incidentByNumber.get("207")!.id },
  ]);

  const memorySeed = [
    ["mem_maya_identity_check", "Maya verifies Customer Identity before Payment API deployments", "Expert Knowledge", "Authorized deployment observation", maya.id, paymentApi.id, "Payment API", "Maya consistently checks Customer Identity migration health before every Payment API deployment.", "Observed in 17 deployment preparations; no deployment runbook documents the check.", "critical", 92, "historical", ["deployment", "maya", "identity", "shadow"]],
    ["mem_legacy_client_abc", "Client ABC historically used Legacy Auth", "Dependency", "Maya handoff note", maya.id, legacyAuth.id, "Legacy Authentication", "Client ABC retained a legacy token fallback during the first OAuth migration wave.", "Historical claim captured in Maya's 2025 handoff notes.", "high", 76, "historical", ["client-abc", "legacy-auth", "historical"]],
    ["mem_oauth_docs", "Client ABC OAuth migration documentation", "Decision", "Architecture documentation", null, customerIdentity.id, "Customer Identity", "Documentation records that Client ABC began an OAuth migration in late 2025.", "The document does not confirm all legacy fallback paths were removed.", "high", 79, "review", ["client-abc", "oauth", "documentation"]],
    ["mem_oauth_prod", "OAuth authentication observed for Client ABC", "Evidence", "Production event", null, customerIdentity.id, "Customer Identity", "Production telemetry observed OAuth authentication for Client ABC.", "Observed OAuth use is not equivalent to a verified migration-completion attestation.", "high", 84, "current", ["client-abc", "oauth", "production"]],
    ["mem_incident_101", "Incident #101: legacy route removal", "Incident", "Incident report", maya.id, legacyAuth.id, "Legacy Authentication", "Removing a legacy authentication route produced enterprise login failures.", "Incident #101 established the first known migration failure pattern.", "critical", 96, "historical", ["incident", "legacy-auth", "login"]],
    ["mem_incident_142", "Incident #142: no rollback at auth cutover", "Incident", "Incident report", leah.id, legacyAuth.id, "Legacy Authentication", "A migration without a tested rollback prolonged login failures after a legacy auth change.", "Incident #142 repeated the legacy cutover pattern.", "critical", 97, "historical", ["incident", "rollback", "legacy-auth"]],
    ["mem_incident_184", "Incident #184: Client ABC login failure", "Incident", "Incident report", maya.id, legacyAuth.id, "Legacy Authentication", "Client ABC was blocked when legacy authentication was removed before client-specific verification.", "Incident #184 directly connects Client ABC to Legacy Auth risk.", "critical", 98, "historical", ["incident", "client-abc", "legacy-auth"]],
    ["mem_rollback_gate", "Auth migration rollback gate", "Decision", "Release council", maya.id, legacyAuth.id, "Legacy Authentication", "No authentication migration is complete without a tested rollback owner and client migration verification.", "Decision created after incidents #101 and #142.", "critical", 91, "current", ["rollback", "decision", "legacy-auth"]],
    ["mem_redis_dead_end", "Redis payment lock experiment failed", "Failure", "Post-incident review", maya.id, paymentApi.id, "Payment API", "Redis-based payment locking caused concurrency contention and was abandoned.", "Database-level locking was the alternative that stabilized authorization.", "high", 93, "historical", ["redis", "locking", "dead-end"]],
    ["mem_db_locking", "Database-level locking accepted for authorization", "Decision", "Architecture decision record", maya.id, paymentApi.id, "Payment API", "Database-level locking is the approved payment authorization locking mechanism.", "Adopted after the failed Redis locking experiment.", "high", 89, "current", ["database", "locking", "payment"]],
    ["mem_friday_pref", "Avoid Friday deployments when possible", "Decision", "Maya operational note", maya.id, paymentApi.id, "Payment API", "Friday deployments were originally a preference because settlement traffic is elevated.", "Original wording was advisory, not a strict prohibition.", "medium", 82, "historical", ["friday", "deployment", "mutation"]],
    ["mem_friday_rule", "Friday payment deployment rule changed", "Conflict", "Release council update", leah.id, paymentApi.id, "Payment API", "Friday deployments require an explicit reliability approver during settlement windows.", "A later interpretation turned an advisory preference into a strict gate.", "high", 86, "current", ["friday", "deployment", "rule"]],
    ["mem_identity_cache", "Restart Identity cache after scope rollout", "Workaround", "Incident #171 review", maya.id, customerIdentity.id, "Customer Identity", "Identity cache restart has repeatedly been needed after new OAuth scopes are deployed.", "No runbook explains the cache dependency or whether the workaround is still required.", "high", 88, "historical", ["identity", "cache", "unknown"]],
    ["mem_billing_export", "Billing export depends on reconciliation schema", "Dependency", "Incident #156 review", arjun.id, billing.id, "Billing Service", "A downstream reconciliation export depends on legacy billing column names.", "Dependency is not represented in the billing service README.", "high", 87, "historical", ["billing", "dependency", "export"]],
    ["mem_notifications_retry", "Notification retries require idempotency keys", "Decision", "Incident #118 review", leah.id, notifications.id, "Notification Service", "All payment notification retries must retain the originating idempotency key.", "Decision prevents duplicate customer communication.", "high", 90, "current", ["notifications", "idempotency", "decision"]],
    ["mem_payment_replay", "Payment replay audit checklist", "Expert Knowledge", "Maya runbook fragment", maya.id, paymentApi.id, "Payment API", "Before replaying a failed payment, inspect the authorization event and the client identity state together.", "This checklist was shared informally during incidents.", "high", 85, "historical", ["payment", "incident", "maya"]],
    ["mem_legacy_token", "Legacy token workaround for account-level failures", "Workaround", "Maya incident notes", maya.id, legacyAuth.id, "Legacy Authentication", "If an enterprise account fails immediately after deployment, verify the legacy token fallback before changing OAuth configuration.", "Workaround was learned during Client ABC incident triage.", "critical", 94, "historical", ["legacy-token", "client-abc", "workaround"]],
    ["mem_customer_identity_owner", "Customer Identity has implicit Maya dependency", "Dependency", "Access review", maya.id, customerIdentity.id, "Customer Identity", "Maya is the only engineer who routinely reviews migration-status edge cases before deployments.", "Critical reasoning is not captured in system ownership documentation.", "critical", 90, "historical", ["maya", "identity", "handoff"]],
    ["mem_schema_contract", "Migration contract needs consumer inventory", "Decision", "Platform architecture", arjun.id, billing.id, "Billing Service", "Schema migrations must include a consumer inventory and rollback plan.", "Created after billing reconciliation schema drift.", "high", 86, "current", ["migration", "billing", "rollback"]],
    ["mem_failure_communication", "Warn clients before auth routing changes", "Decision", "Support playbook", leah.id, legacyAuth.id, "Legacy Authentication", "Enterprise clients must receive a migration verification request before authentication routing changes.", "A communication requirement created after incident #184.", "high", 89, "current", ["client", "auth", "communication"]],
    ["mem_unknown_scope", "Unknown knowledge: OAuth scope cache condition", "Unknown", "Pattern engine", null, customerIdentity.id, "Customer Identity", "The organization repeatedly restarts identity cache after scope changes but has no confirmed root cause.", "Observed behavior is well-supported; explanation remains unknown.", "high", 72, "review", ["unknown", "identity", "cache"]],
    ["mem_notification_dependency", "Notification degradation masks payment failures", "Dependency", "Incident correlation", leah.id, notifications.id, "Notification Service", "Notification retries can mask the user-facing impact of payment authorization failures.", "Operational dashboards should correlate payment and notification outcomes.", "medium", 76, "historical", ["payments", "notifications", "dependency"]],
    ["mem_maya_release_sequence", "Maya release sequence has hidden identity gate", "Expert Knowledge", "Pattern engine", maya.id, paymentApi.id, "Payment API", "Maya checks Customer Identity, verifies Client ABC status, then authorizes the payment deployment.", "Repeated release sequence is not captured in any official runbook.", "critical", 91, "historical", ["maya", "release", "shadow"]],
    ["mem_auth_service_map", "Legacy Authentication is coupled to Customer Identity", "Dependency", "System mapping", maya.id, legacyAuth.id, "Legacy Authentication", "Legacy token routing references Customer Identity configuration for selected enterprise accounts.", "Coupling is hidden from the Legacy Auth service interface.", "critical", 95, "historical", ["legacy-auth", "identity", "dependency"]],
  ] as const;

  await db.insert(memories).values(
    memorySeed.map(([publicId, title, memoryType, source, employeeId, projectId, component, summary, historicalContext, importance, confidence, status, tags]) => ({
      publicId,
      title,
      memoryType,
      source,
      employeeId,
      projectId,
      component,
      summary,
      historicalContext,
      importance,
      confidence,
      status,
      tags: JSON.stringify(tags),
      isCurrent: status === "current" ? 1 : 0,
    }))
  );

  const memoryRows = await db.select().from(memories);
  const memoryByPublicId = new Map(memoryRows.map(memory => [memory.publicId, memory]));

  await db.insert(evidence).values([
    {
      publicId: "ev_maya_legacy",
      memoryId: memoryByPublicId.get("mem_legacy_client_abc")!.id,
      source: "Maya",
      claim: "Client ABC still uses Legacy Auth.",
      component: "Legacy Authentication",
      confidence: 76,
      evidenceStatus: "historical",
      observedAt: date("2025-08-20T09:00:00Z"),
    },
    {
      publicId: "ev_docs_oauth",
      memoryId: memoryByPublicId.get("mem_oauth_docs")!.id,
      source: "Documentation",
      claim: "Client ABC migrated to OAuth.",
      component: "Customer Identity",
      confidence: 79,
      evidenceStatus: "current",
      observedAt: date("2026-01-17T10:00:00Z"),
    },
    {
      publicId: "ev_prod_oauth",
      memoryId: memoryByPublicId.get("mem_oauth_prod")!.id,
      source: "Production",
      claim: "OAuth authentication detected for Client ABC.",
      component: "Customer Identity",
      confidence: 84,
      evidenceStatus: "current",
      observedAt: date("2026-02-05T18:00:00Z"),
    },
    {
      publicId: "ev_incident_184",
      memoryId: memoryByPublicId.get("mem_incident_184")!.id,
      incidentId: incidentByNumber.get("184")!.id,
      source: "Incident report",
      claim: "Client ABC login failure followed Legacy Auth removal.",
      component: "Legacy Authentication",
      confidence: 98,
      evidenceStatus: "historical",
      observedAt: date("2025-11-14T16:40:00Z"),
    },
  ]);

  await db.insert(knowledgePatterns).values([
    {
      publicId: "kp_maya_identity",
      patternType: "shadow",
      title: "Maya's undocumented Customer Identity check",
      behavior: "Maya consistently checks Customer Identity before Payment API deployments.",
      employeeId: maya.id,
      projectId: paymentApi.id,
      component: "Customer Identity",
      occurrenceCount: 17,
      documentationStatus: "not_found",
      reason: "The check is repeated but no deployment runbook explains it.",
      confidence: 92,
      importance: "high",
      status: "open",
    },
    {
      publicId: "kp_maya_client_gate",
      patternType: "shadow",
      title: "Enterprise-client migration gate",
      behavior: "Maya asks for an account-level migration confirmation before changing legacy authentication routing.",
      employeeId: maya.id,
      projectId: legacyAuth.id,
      component: "Legacy Authentication",
      occurrenceCount: 11,
      documentationStatus: "partial",
      reason: "Customer-specific verification is only present in personal incident notes.",
      confidence: 89,
      importance: "critical",
      status: "open",
    },
    {
      publicId: "kp_identity_restart",
      patternType: "shadow",
      title: "Identity cache restart after OAuth scope changes",
      behavior: "Engineers restart Customer Identity cache after OAuth scope rollouts.",
      employeeId: maya.id,
      projectId: customerIdentity.id,
      component: "Customer Identity",
      occurrenceCount: 12,
      documentationStatus: "not_found",
      reason: "Behavior is repeated; the underlying dependency is not documented.",
      confidence: 86,
      importance: "high",
      status: "investigating",
    },
    {
      publicId: "kp_friday_mutation",
      patternType: "mutation",
      title: "Friday deployment guidance changed meaning",
      behavior: "“Avoid Friday deployments when possible” was later treated as a strict release prohibition.",
      employeeId: maya.id,
      projectId: paymentApi.id,
      component: "Payment API",
      occurrenceCount: 6,
      documentationStatus: "partial",
      reason: "Original preference and current interpretation differ materially.",
      confidence: 84,
      importance: "high",
      status: "open",
    },
    {
      publicId: "kp_redis_deadend",
      patternType: "dead_end",
      title: "Redis payment lock is a previously failed approach",
      behavior: "Use Redis for payment locking.",
      employeeId: maya.id,
      projectId: paymentApi.id,
      component: "Payment API",
      occurrenceCount: 3,
      documentationStatus: "documented",
      reason: "Failed because of concurrency contention; database-level locking is the accepted alternative.",
      confidence: 93,
      importance: "high",
      status: "documented",
    },
  ]);

  await db.insert(knowledgeGaps).values([
    {
      publicId: "kg_identity_cache",
      title: "Reason for Identity cache restart is unknown",
      observedBehavior: "Customer Identity is repeatedly restarted after OAuth scope deployment.",
      knownReason: "Unknown — stale configuration cache is suspected but unconfirmed.",
      component: "Customer Identity",
      projectId: customerIdentity.id,
      occurrenceCount: 12,
      documentationStatus: "not_found",
      knowledgeRisk: "high",
      status: "investigating",
    },
    {
      publicId: "kg_legacy_clients",
      title: "Enterprise client Legacy Auth inventory is incomplete",
      observedBehavior: "Client migration status is checked manually before legacy routing changes.",
      knownReason: "No authoritative per-client migration register exists.",
      component: "Legacy Authentication",
      projectId: legacyAuth.id,
      occurrenceCount: 9,
      documentationStatus: "partial",
      knowledgeRisk: "critical",
      status: "open",
    },
    {
      publicId: "kg_billing_export", 
      title: "Billing export consumers are undocumented",
      observedBehavior: "Schema changes require manual searches for reconciliation exporters.",
      knownReason: "Consumer ownership was never captured in the system catalog.",
      component: "Billing Service",
      projectId: billing.id,
      occurrenceCount: 7,
      documentationStatus: "not_found",
      knowledgeRisk: "high",
      status: "open",
    },
    {
      publicId: "kg_payment_replay",
      title: "Payment replay triage sequence is tribal knowledge",
      observedBehavior: "Experienced engineers inspect authorization and identity state before replay.",
      knownReason: "The incident checklist is not published.",
      component: "Payment API",
      projectId: paymentApi.id,
      occurrenceCount: 8,
      documentationStatus: "not_found",
      knowledgeRisk: "high",
      status: "open",
    },
    {
      publicId: "kg_notification_correlation",
      title: "Notification-to-payment impact correlation is missing",
      observedBehavior: "Notification retries hide customer-facing authorization impact.",
      knownReason: "No shared service dependency dashboard exists.",
      component: "Notification Service",
      projectId: notifications.id,
      occurrenceCount: 5,
      documentationStatus: "partial",
      knowledgeRisk: "medium",
      status: "open",
    },
  ]);

  await db.insert(conflicts).values([
    {
      publicId: "conf_client_abc",
      title: "Client ABC authentication state",
      component: "Legacy Authentication",
      historicalClaim: "Client ABC still uses Legacy Auth.",
      historicalSource: "Maya · 2025-08-20",
      currentClaim: "Client ABC uses OAuth, but full legacy-fallback removal remains unverified.",
      currentSource: "Documentation + Production · 2026-02-05",
      currentConfidence: 84,
      evidenceSummary: "Maya's historical handoff note conflicts with an OAuth migration document and production OAuth telemetry. No verified client completion record existed at seed time.",
      status: "monitoring",
    },
    {
      publicId: "conf_friday", 
      title: "Friday deployment policy meaning drift",
      component: "Payment API",
      historicalClaim: "Avoid Friday deployments when possible.",
      historicalSource: "Maya operational note",
      currentClaim: "Friday settlement-window deployments require reliability approval.",
      currentSource: "Release council update",
      currentConfidence: 86,
      evidenceSummary: "The organizational meaning changed from preference to an operational control.",
      status: "resolved",
    },
    {
      publicId: "conf_identity_cache",
      title: "Identity cache restart rationale",
      component: "Customer Identity",
      historicalClaim: "Restarting the cache is part of safe deployment.",
      historicalSource: "Repeated employee action",
      currentClaim: "The restart may be a workaround for stale scope configuration.",
      currentSource: "Incident #171 review",
      currentConfidence: 68,
      evidenceSummary: "Behavior is supported by repeated events, but the root cause remains unverified.",
      status: "open",
    },
  ]);

  const eventSeed = [
    ["evt_maya_deploy_1", "DEPLOYMENT_STARTED", maya.id, paymentApi.id, "Payment API", "Maya begins Payment API deployment and checks Customer Identity first.", "2026-02-10T09:41:00Z", "MONITORING", "observe"],
    ["evt_maya_identity_1", "EMPLOYEE_ACTION", maya.id, customerIdentity.id, "Customer Identity", "Maya verifies Client ABC identity routing before Payment API deployment.", "2026-02-10T09:42:00Z", "COMPLETE", "observe"],
    ["evt_maya_deploy_2", "DEPLOYMENT_STARTED", maya.id, paymentApi.id, "Payment API", "Maya repeats Customer Identity pre-deployment check.", "2026-02-17T09:41:00Z", "COMPLETE", "observe"],
    ["evt_maya_identity_2", "EMPLOYEE_ACTION", maya.id, customerIdentity.id, "Customer Identity", "Maya reviews OAuth scope cache before deployment.", "2026-02-17T09:42:00Z", "COMPLETE", "suggestion"],
    ["evt_maya_deploy_3", "DEPLOYMENT_STARTED", maya.id, paymentApi.id, "Payment API", "Maya begins a Payment API deployment after customer identity review.", "2026-02-24T09:41:00Z", "COMPLETE", "observe"],
    ["evt_incident_184", "INCIDENT_RESOLVED", maya.id, legacyAuth.id, "Legacy Authentication", "Incident #184 resolved after restoring Legacy Auth routing for Client ABC.", "2025-11-14T17:25:00Z", "COMPLETE", "critical"],
    ["evt_billing_schema", "CODE_CHANGED", arjun.id, billing.id, "Billing Service", "Billing reconciliation schema migration reviewed with consumer inventory.", "2026-03-02T12:05:00Z", "COMPLETE", "suggestion"],
    ["evt_docs_oauth", "DOCUMENT_UPDATED", arjun.id, customerIdentity.id, "Customer Identity", "OAuth migration status documentation was refreshed for Client ABC.", "2026-03-04T10:12:00Z", "COMPLETE", "suggestion"],
  ] as const;

  await db.insert(events).values(
    eventSeed.map(([publicId, eventType, employeeId, projectId, component, description, eventTimestamp, processingStage, riskLevel]) => ({
      publicId,
      eventType,
      employeeId,
      projectId,
      component,
      description,
      metadata: JSON.stringify({ seeded: true }),
      eventTimestamp: date(eventTimestamp),
      processingStage,
      riskLevel,
      analysisSummary: "Historical authorized activity available to the background agent.",
    }))
  );

  await db.insert(warnings).values([
    {
      publicId: "warn_identity_gap",
      severity: "suggestion",
      title: "Potential undocumented workaround detected",
      action: "Identity cache restart after OAuth scope deployment",
      component: "Customer Identity",
      potentialImpact: "Scope changes may not take effect for clients until a manual restart.",
      confidence: 78,
      reason: "Historical evidence suggests a repeated but undocumented recovery behavior.",
      recommendation: "Investigate the cache dependency and create a verified runbook entry.",
      evidenceSummary: "12 observed restarts; no authoritative explanation found.",
      status: "active",
    },
    {
      publicId: "warn_billing_dependency",
      severity: "information",
      title: "Hidden downstream dependency retained",
      action: "Billing reconciliation schema change",
      component: "Billing Service",
      potentialImpact: "Undocumented exporter may fail after a schema migration.",
      confidence: 81,
      reason: "A historical incident linked billing schema drift to a downstream export.",
      recommendation: "Confirm consumer inventory before migration.",
      evidenceSummary: "Incident #156 and the billing-export dependency memory.",
      status: "active",
    },
  ]);

  await db.insert(organizationSettings).values({
    organizationId: "finpay",
    agentEnabled: 1,
    observationSources: JSON.stringify(["GitHub", "Jira", "Docs", "CI/CD", "Simulated Events"]),
    notificationLevel: "warnings",
    memoryEnabled: 1,
    retentionDays: 365,
  });

  await ensureSeedEnrichment();
}

/** Adds missing baseline demo knowledge without touching any existing record. */
async function ensureSeedEnrichment() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [undocumented] = await db
    .select({ total: count() })
    .from(knowledgePatterns)
    .where(eq(knowledgePatterns.documentationStatus, "not_found"));
  const missing = Math.max(0, 5 - Number(undocumented?.total ?? 0));
  if (!missing) return;

  const [maya] = await db.select().from(employees).where(eq(employees.name, "Maya")).limit(1);
  const [paymentApi] = await db
    .select()
    .from(projects)
    .where(eq(projects.component, "Payment API"))
    .limit(1);
  const [legacyAuth] = await db
    .select()
    .from(projects)
    .where(eq(projects.component, "Legacy Authentication"))
    .limit(1);
  if (!maya || !paymentApi || !legacyAuth) return;

  const candidates = [
    {
      publicId: "kp_maya_incident_history",
      title: "Maya checks incident history before changing payment routing",
      behavior: "Maya reviews previous payment-routing incidents before approving a routing change.",
      projectId: paymentApi.id,
      component: "Payment API",
      occurrenceCount: 9,
      confidence: 85,
      importance: "high" as const,
    },
    {
      publicId: "kp_maya_rollback_owner",
      title: "Maya names a rollback owner before auth cutover",
      behavior: "Maya assigns a rollback owner before authentication routing changes are released.",
      projectId: legacyAuth.id,
      component: "Legacy Authentication",
      occurrenceCount: 8,
      confidence: 88,
      importance: "critical" as const,
    },
    {
      publicId: "kp_maya_enterprise_verification",
      title: "Maya verifies enterprise account routing separately",
      behavior: "Maya checks enterprise account routing separately from general OAuth migration status.",
      projectId: legacyAuth.id,
      component: "Legacy Authentication",
      occurrenceCount: 7,
      confidence: 86,
      importance: "critical" as const,
    },
  ];
  const existingRows = await db.select({ publicId: knowledgePatterns.publicId }).from(knowledgePatterns);
  const existingIds = new Set(existingRows.map(row => row.publicId));
  const additions = candidates
    .filter(candidate => !existingIds.has(candidate.publicId))
    .slice(0, missing)
    .map(candidate => ({
      ...candidate,
      patternType: "shadow" as const,
      employeeId: maya.id,
      documentationStatus: "not_found" as const,
      reason: "Repeated operational behavior is not represented in an official FinPay runbook.",
      status: "open" as const,
    }));
  if (additions.length) await db.insert(knowledgePatterns).values(additions);
}
