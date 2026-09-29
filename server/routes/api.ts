import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { Router } from "express";
import { nanoid } from "nanoid";
import {
  conflicts,
  employees,
  events,
  evidence,
  failureFingerprints,
  fingerprintIncidents,
  handoffSessions,
  handoffTestResults,
  incidents,
  knowledgeGaps,
  knowledgePatterns,
  memories,
  organizationSettings,
  projects,
  warnings,
} from "../../drizzle/schema";
import {
  eventInputSchema,
  handoffInputSchema,
  handoffTestInputSchema,
  memoryInputSchema,
  memoryQuerySchema,
  patternActionSchema,
  settingsInputSchema,
  warningActionSchema,
} from "../../shared/handoff";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { processAuthorizedEvent, recentProcessingState } from "../services/intelligence";
import { getMemoryService } from "../services/memory";
import { connectorRoadmap } from "../services/connectors";
import { ensureDemoData } from "../services/seed";
import { requireFinPayMembership, WorkspaceAccessError } from "../services/access";

const publicId = (prefix: string) => `${prefix}_${nanoid(12)}`;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected server error";
}

async function requireUser(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
      return null;
    }
    return user;
  } catch {
    res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
    return null;
  }
}

function asyncRoute(handler: (req: Request, res: Response, user: NonNullable<Awaited<ReturnType<typeof sdk.authenticateRequest>>>) => Promise<void>) {
  return async (req: Request, res: Response) => {
    res.set("Cache-Control", "private, no-store");
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      await ensureDemoData();
      await requireFinPayMembership(user.id);
      await handler(req, res, user);
    } catch (error) {
      console.error("[HandoffOS API]", error);
      if (error instanceof WorkspaceAccessError) {
        res.status(403).json({ error: error.message, code: "FORBIDDEN" });
        return;
      }
      res.status(500).json({ error: errorMessage(error) });
    }
  };
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseBody<T>(schema: { parse: (value: unknown) => T }, req: Request, res: Response): T | null {
  try {
    return schema.parse(req.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request body";
    res.status(400).json({ error: message });
    return null;
  }
}

export function registerHandoffRoutes(app: Express) {
  const api = Router();

  api.get(
    "/overview",
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const [eventTotal] = await db.select({ total: count() }).from(events);
      const [memoryTotal] = await db.select({ total: count() }).from(memories);
      const [patternTotal] = await db.select({ total: count() }).from(knowledgePatterns).where(eq(knowledgePatterns.patternType, "shadow"));
      const [gapTotal] = await db.select({ total: count() }).from(knowledgeGaps).where(eq(knowledgeGaps.status, "open"));
      const [warningTotal] = await db.select({ total: count() }).from(warnings).where(eq(warnings.status, "active"));
      const [criticalDependencyTotal] = await db
        .select({ total: count() })
        .from(memories)
        .where(and(eq(memories.memoryType, "Dependency"), eq(memories.importance, "critical")));
      const latest = await recentProcessingState();
      const [settings] = await db.select().from(organizationSettings).where(eq(organizationSettings.organizationId, "finpay")).limit(1);
      const criticalWarnings = await db
        .select()
        .from(warnings)
        .where(and(eq(warnings.severity, "critical"), eq(warnings.status, "active")))
        .orderBy(desc(warnings.createdAt))
        .limit(3);
      const latestPatterns = await db.select().from(knowledgePatterns).orderBy(desc(knowledgePatterns.updatedAt)).limit(3);

      res.json({
        agent: {
          active: Boolean(settings?.agentEnabled),
          observationNotice: settings?.agentEnabled ? "Observing authorized project activity." : "Background agent is paused by workspace settings.",
          currentOperation: settings?.agentEnabled ? (latest ? `Analyzing ${latest.eventType.replace(/_/g, " ")} · ${latest.component}` : "Monitoring FinPay organizational memory") : "Awaiting explicit reactivation",
          stage: settings?.agentEnabled ? (latest?.processingStage ?? "MONITORING") : "PAUSED",
        },
        metrics: {
          eventsObserved: Number(eventTotal?.total ?? 0),
          memoriesCreated: Number(memoryTotal?.total ?? 0),
          hiddenPatterns: Number(patternTotal?.total ?? 0),
          knowledgeGaps: Number(gapTotal?.total ?? 0),
          activeWarnings: Number(warningTotal?.total ?? 0),
          criticalDependencies: Number(criticalDependencyTotal?.total ?? 0),
        },
        criticalWarnings,
        latestPatterns,
      });
    })
  );

  api.get(
    "/events",
    asyncRoute(async (req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const limit = Math.min(Math.max(Number(req.query.limit ?? 30), 1), 100);
      const rows = await db
        .select({
          id: events.id,
          publicId: events.publicId,
          eventType: events.eventType,
          component: events.component,
          description: events.description,
          metadata: events.metadata,
          eventTimestamp: events.eventTimestamp,
          processingStage: events.processingStage,
          riskLevel: events.riskLevel,
          analysisSummary: events.analysisSummary,
          employeeName: employees.name,
          projectName: projects.name,
        })
        .from(events)
        .leftJoin(employees, eq(events.employeeId, employees.id))
        .leftJoin(projects, eq(events.projectId, projects.id))
        .orderBy(desc(events.eventTimestamp))
        .limit(limit);
      res.json({ events: rows.map(row => ({ ...row, metadata: parseJson(row.metadata, {}) })) });
    })
  );

  const processEventHandler = asyncRoute(async (req, res) => {
    const input = parseBody(eventInputSchema, req, res);
    if (!input) return;
    const result = await processAuthorizedEvent(input);
    res.status(201).json(result);
  });
  api.post("/events", processEventHandler);
  api.post("/analyze-event", processEventHandler);

  api.get(
    "/memories",
    asyncRoute(async (req, res) => {
      const parsed = memoryQuerySchema.parse(req.query);
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const filters = [];
      if (parsed.q) {
        const query = `%${parsed.q}%`;
        filters.push(or(like(memories.title, query), like(memories.summary, query), like(memories.tags, query))!);
      }
      if (parsed.type) filters.push(eq(memories.memoryType, parsed.type as typeof memories.$inferSelect.memoryType));
      if (parsed.importance) filters.push(eq(memories.importance, parsed.importance as typeof memories.$inferSelect.importance));
      if (parsed.status) filters.push(eq(memories.status, parsed.status as typeof memories.$inferSelect.status));
      const order = parsed.sort === "confidence" ? desc(memories.confidence) : parsed.sort === "importance" ? desc(memories.importance) : desc(memories.createdAt);
      const rows = await db.select().from(memories).where(filters.length ? and(...filters) : undefined).orderBy(order).limit(120);
      res.json({ memories: rows.map(row => ({ ...row, tags: parseJson<string[]>(row.tags, []) })) });
    })
  );

  api.post(
    "/memories",
    asyncRoute(async (req, res) => {
      const input = parseBody(memoryInputSchema, req, res);
      if (!input) return;
      const memory = await getMemoryService().remember(input);
      res.status(201).json({ memory: { ...memory, tags: parseJson<string[]>(memory.tags, []) } });
    })
  );

  api.get(
    "/memories/:publicId",
    asyncRoute(async (req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const [memory] = await db.select().from(memories).where(eq(memories.publicId, req.params.publicId)).limit(1);
      if (!memory) {
        res.status(404).json({ error: "Memory not found" });
        return;
      }
      const evidenceRows = await db.select().from(evidence).where(eq(evidence.memoryId, memory.id)).orderBy(desc(evidence.observedAt));
      res.json({ memory: { ...memory, tags: parseJson<string[]>(memory.tags, []) }, evidence: evidenceRows });
    })
  );

  api.get(
    "/warnings",
    asyncRoute(async (req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const severity = typeof req.query.severity === "string" ? req.query.severity : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const filters = [];
      if (severity) filters.push(eq(warnings.severity, severity as typeof warnings.$inferSelect.severity));
      if (status) filters.push(eq(warnings.status, status as typeof warnings.$inferSelect.status));
      const rows = await db.select().from(warnings).where(filters.length ? and(...filters) : undefined).orderBy(desc(warnings.createdAt)).limit(100);
      res.json({ warnings: rows });
    })
  );

  api.get(
    "/warnings/:publicId/evidence",
    asyncRoute(async (req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const [warning] = await db.select().from(warnings).where(eq(warnings.publicId, req.params.publicId)).limit(1);
      if (!warning) {
        res.status(404).json({ error: "Warning not found" });
        return;
      }
      const linkedIncidents = warning.fingerprintId
        ? await db
            .select({ incidentNumber: incidents.incidentNumber, title: incidents.title, component: incidents.component, consequence: incidents.consequence, occurredAt: incidents.occurredAt })
            .from(fingerprintIncidents)
            .innerJoin(incidents, eq(fingerprintIncidents.incidentId, incidents.id))
            .where(eq(fingerprintIncidents.fingerprintId, warning.fingerprintId))
        : [];
      const componentEvidence = await db
        .select()
        .from(evidence)
        .where(eq(evidence.component, warning.component))
        .orderBy(desc(evidence.observedAt))
        .limit(8);
      res.json({ warning, incidents: linkedIncidents, evidence: componentEvidence });
    })
  );

  api.patch(
    "/warnings/:publicId",
    asyncRoute(async (req, res) => {
      const parsed = parseBody(warningActionSchema, req, res);
      if (!parsed) return;
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      await db.update(warnings).set({ status: parsed.status }).where(eq(warnings.publicId, req.params.publicId));
      const [warning] = await db.select().from(warnings).where(eq(warnings.publicId, req.params.publicId)).limit(1);
      res.json({ warning });
    })
  );

  api.get(
    "/knowledge-shadow",
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const rows = await db.select().from(knowledgePatterns).where(eq(knowledgePatterns.patternType, "shadow")).orderBy(desc(knowledgePatterns.confidence));
      res.json({ patterns: rows });
    })
  );

  api.get(
    "/patterns",
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const rows = await db.select().from(knowledgePatterns).orderBy(desc(knowledgePatterns.updatedAt));
      res.json({ patterns: rows });
    })
  );

  api.patch(
    "/patterns/:publicId",
    asyncRoute(async (req, res) => {
      const parsed = parseBody(patternActionSchema, req, res);
      if (!parsed) return;
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const status = parsed.action === "document" ? "documented" : parsed.action === "dismiss" ? "dismissed" : "investigating";
      await db.update(knowledgePatterns).set({ status, actionTaken: parsed.action }).where(eq(knowledgePatterns.publicId, req.params.publicId));
      const [pattern] = await db.select().from(knowledgePatterns).where(eq(knowledgePatterns.publicId, req.params.publicId)).limit(1);
      res.json({ pattern });
    })
  );

  api.get(
    "/failure-fingerprints",
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const rows = await db.select().from(failureFingerprints).orderBy(desc(failureFingerprints.severity), desc(failureFingerprints.confidence));
      const result = await Promise.all(
        rows.map(async fingerprint => {
          const linked = await db
            .select({ incidentNumber: incidents.incidentNumber, title: incidents.title })
            .from(fingerprintIncidents)
            .innerJoin(incidents, eq(fingerprintIncidents.incidentId, incidents.id))
            .where(eq(fingerprintIncidents.fingerprintId, fingerprint.id));
          return { ...fingerprint, incidents: linked };
        })
      );
      res.json({ fingerprints: result });
    })
  );

  api.get(
    "/knowledge-gaps",
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const rows = await db.select().from(knowledgeGaps).orderBy(desc(knowledgeGaps.knowledgeRisk), desc(knowledgeGaps.occurrenceCount));
      res.json({ gaps: rows });
    })
  );

  api.patch(
    "/knowledge-gaps/:publicId",
    asyncRoute(async (req, res) => {
      const action = typeof req.body?.action === "string" ? req.body.action : "";
      if (!["investigate", "ask_expert", "create_record"].includes(action)) {
        res.status(400).json({ error: "A valid knowledge-gap action is required." });
        return;
      }
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const [gap] = await db.select().from(knowledgeGaps).where(eq(knowledgeGaps.publicId, req.params.publicId)).limit(1);
      if (!gap) {
        res.status(404).json({ error: "Knowledge gap not found" });
        return;
      }
      const status = action === "create_record" ? "resolved" : "investigating";
      await db.update(knowledgeGaps).set({ status }).where(eq(knowledgeGaps.id, gap.id));
      if (action === "create_record") {
        await getMemoryService().remember({
          title: `Knowledge record: ${gap.title}`,
          memoryType: "Unknown",
          source: "Knowledge Gap action",
          project: "FinPay",
          component: gap.component,
          summary: gap.observedBehavior,
          historicalContext: gap.knownReason ?? "Reason remains unknown; record created for review.",
          importance: gap.knowledgeRisk === "critical" ? "critical" : gap.knowledgeRisk,
          confidence: 65,
          status: "review",
          tags: ["knowledge-gap", "follow-up"],
        });
      }
      const [updated] = await db.select().from(knowledgeGaps).where(eq(knowledgeGaps.id, gap.id)).limit(1);
      res.json({ gap: updated, action });
    })
  );

  api.get(
    "/conflicts",
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const rows = await db.select().from(conflicts).orderBy(desc(conflicts.updatedAt));
      res.json({ conflicts: rows });
    })
  );

  api.get(
    "/timeline",
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const [memoryRows, evidenceRows, incidentRows, patternRows] = await Promise.all([
        db.select().from(memories).orderBy(desc(memories.createdAt)).limit(80),
        db.select().from(evidence).orderBy(desc(evidence.observedAt)).limit(80),
        db.select().from(incidents).orderBy(desc(incidents.occurredAt)).limit(40),
        db.select().from(knowledgePatterns).where(eq(knowledgePatterns.patternType, "mutation")).orderBy(desc(knowledgePatterns.updatedAt)).limit(20),
      ]);
      const timeline = [
        ...memoryRows.map(row => ({ id: row.publicId, type: "memory", date: row.createdAt, title: row.title, component: row.component, current: row.status === "current", detail: row.summary })),
        ...evidenceRows.map(row => ({ id: row.publicId, type: "evidence", date: row.observedAt, title: row.claim, component: row.component, current: row.evidenceStatus !== "historical", detail: row.source })),
        ...incidentRows.map(row => ({ id: `incident_${row.incidentNumber}`, type: "incident", date: row.occurredAt, title: `Incident #${row.incidentNumber}: ${row.title}`, component: row.component, current: false, detail: row.consequence })),
        ...patternRows.map(row => ({ id: row.publicId, type: "mutation", date: row.updatedAt, title: row.title, component: row.component, current: false, detail: row.behavior })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      res.json({ timeline });
    })
  );

  api.get(
    "/graph",
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const [employeeRows, projectRows, memoryRows, incidentRows] = await Promise.all([
        db.select().from(employees),
        db.select().from(projects),
        db.select().from(memories).orderBy(desc(memories.importance)).limit(16),
        db.select().from(incidents).orderBy(desc(incidents.occurredAt)).limit(8),
      ]);
      const nodes = [
        ...employeeRows.map(row => ({ id: `employee-${row.id}`, label: row.name, kind: "person", detail: row.role })),
        ...projectRows.map(row => ({ id: `project-${row.id}`, label: row.component, kind: "system", detail: row.description })),
        ...memoryRows.map(row => ({ id: `memory-${row.id}`, label: row.title, kind: "memory", detail: row.summary })),
        ...incidentRows.map(row => ({ id: `incident-${row.id}`, label: `#${row.incidentNumber}`, kind: "incident", detail: row.title })),
      ];
      const links = [
        ...projectRows.filter(row => row.ownerEmployeeId).map(row => ({ source: `employee-${row.ownerEmployeeId}`, target: `project-${row.id}`, label: "owns" })),
        ...memoryRows.filter(row => row.projectId).map(row => ({ source: `project-${row.projectId}`, target: `memory-${row.id}`, label: "remembers" })),
        ...incidentRows.filter(row => row.projectId).map(row => ({ source: `project-${row.projectId}`, target: `incident-${row.id}`, label: "experienced" })),
      ];
      res.json({ nodes, links });
    })
  );

  api.get(
    "/settings",
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const [settings] = await db.select().from(organizationSettings).where(eq(organizationSettings.organizationId, "finpay")).limit(1);
      res.json({
        settings: settings
          ? {
              ...settings,
              agentEnabled: Boolean(settings.agentEnabled),
              memoryEnabled: Boolean(settings.memoryEnabled),
              observationSources: parseJson<string[]>(settings.observationSources, ["Simulated Events"]),
            }
          : null,
        connectors: connectorRoadmap,
      });
    })
  );

  api.put(
    "/settings",
    asyncRoute(async (req, res) => {
      const parsed = parseBody(settingsInputSchema, req, res);
      if (!parsed) return;
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      await db
        .update(organizationSettings)
        .set({
          agentEnabled: parsed.agentEnabled ? 1 : 0,
          observationSources: JSON.stringify(parsed.observationSources),
          notificationLevel: parsed.notificationLevel,
          memoryEnabled: parsed.memoryEnabled ? 1 : 0,
          retentionDays: parsed.retentionDays,
        })
        .where(eq(organizationSettings.organizationId, "finpay"));
      const [settings] = await db.select().from(organizationSettings).where(eq(organizationSettings.organizationId, "finpay")).limit(1);
      res.json({ settings });
    })
  );

  api.post(
    "/handoff",
    asyncRoute(async (req, res, user) => {
      const parsed = parseBody(handoffInputSchema, req, res);
      if (!parsed) return;
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const [employee] = await db.select().from(employees).where(eq(employees.name, parsed.employee)).limit(1);
      if (!employee) {
        res.status(404).json({ error: "Employee not found" });
        return;
      }
      if (parsed.simulateDeparture) await db.update(employees).set({ status: "departed" }).where(eq(employees.id, employee.id));
      const [criticalKnowledge] = await db.select({ total: count() }).from(memories).where(and(eq(memories.employeeId, employee.id), eq(memories.importance, "critical")));
      const [patterns] = await db.select({ total: count() }).from(knowledgePatterns).where(and(eq(knowledgePatterns.employeeId, employee.id), eq(knowledgePatterns.documentationStatus, "not_found")));
      const [dependencies] = await db.select({ total: count() }).from(memories).where(and(eq(memories.employeeId, employee.id), eq(memories.memoryType, "Dependency")));
      const [decisions] = await db.select({ total: count() }).from(memories).where(and(eq(memories.employeeId, employee.id), eq(memories.memoryType, "Decision")));
      const [gaps] = await db.select({ total: count() }).from(knowledgeGaps).where(eq(knowledgeGaps.status, "open"));
      const transferItems = [
        "Verify Client ABC configuration and migration status before Legacy Auth changes.",
        "Check Customer Identity before Payment API deployments.",
        "Inspect legacy token fallback during immediate post-deployment authentication failures.",
        "Retain a tested rollback path for authentication cutovers.",
      ];
      const sessionPublicId = publicId("handoff");
      await db.insert(handoffSessions).values({
        publicId: sessionPublicId,
        employeeId: employee.id,
        createdByUserId: user.id,
        status: "active",
        handoffRisk: "high",
        criticalKnowledgeCount: Number(criticalKnowledge?.total ?? 0),
        undocumentedPatternCount: Number(patterns?.total ?? 0),
        dependencyCount: Number(dependencies?.total ?? 0),
        decisionCount: Number(decisions?.total ?? 0),
        gapCount: Number(gaps?.total ?? 0),
        transferItems: JSON.stringify(transferItems),
      });
      const [session] = await db.select().from(handoffSessions).where(eq(handoffSessions.publicId, sessionPublicId)).limit(1);
      res.status(201).json({ session: { ...session, transferItems } });
    })
  );

  api.get(
    "/handoff",
    asyncRoute(async (_req, res) => {
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const [session] = await db.select().from(handoffSessions).orderBy(desc(handoffSessions.createdAt)).limit(1);
      res.json({ session: session ? { ...session, transferItems: parseJson<string[]>(session.transferItems, []) } : null });
    })
  );

  api.post(
    "/handoff/test",
    asyncRoute(async (req, res) => {
      const parsed = parseBody(handoffTestInputSchema, req, res);
      if (!parsed) return;
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable");
      const [session] = parsed.sessionId
        ? await db.select().from(handoffSessions).where(eq(handoffSessions.id, parsed.sessionId)).limit(1)
        : await db.select().from(handoffSessions).orderBy(desc(handoffSessions.createdAt)).limit(1);
      if (!session) {
        res.status(400).json({ error: "Create a Handoff Simulator session before taking the reasoning test." });
        return;
      }
      const answer = parsed.answer.toLowerCase();
      const rubric = [
        { label: "Check authentication service and routing", match: ["authentication", "legacy auth", "auth service", "routing"] },
        { label: "Verify Client ABC configuration and migration state", match: ["client abc", "client configuration", "identity configuration", "migration"] },
        { label: "Check the legacy token workaround", match: ["legacy token", "token fallback", "fallback"] },
        { label: "Confirm a tested rollback path", match: ["rollback", "revert"] },
      ];
      const covered = rubric.filter(item => item.match.some(term => answer.includes(term))).map(item => item.label);
      const missed = rubric.filter(item => !item.match.some(term => answer.includes(term))).map(item => item.label);
      const transferPercentage = Math.round((covered.length / rubric.length) * 100);
      const resultPublicId = publicId("test");
      await db.insert(handoffTestResults).values({
        publicId: resultPublicId,
        sessionId: session.id,
        answer: parsed.answer,
        coveredItems: JSON.stringify(covered),
        missedItems: JSON.stringify(missed),
        transferPercentage,
      });
      res.status(201).json({
        result: {
          publicId: resultPublicId,
          transferPercentage,
          coveredItems: covered,
          missedItems: missed,
          whatMayaKnew: missed.length ? missed : ["The critical reasoning checklist was transferred successfully."],
        },
      });
    })
  );

  app.use("/api", api);
}
