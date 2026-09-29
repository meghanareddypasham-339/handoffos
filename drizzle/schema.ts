import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * HandoffOS uses stable database records for all organization knowledge. Data is
 * intentionally append-friendly: historical memories, evidence, and conflicts are
 * preserved while a newer current interpretation can be identified separately.
 */

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/**
 * The demo is a single FinPay workspace. Membership is explicit so a valid
 * platform session alone is not sufficient to read or mutate organization data.
 */
export const organizationMembers = mysqlTable(
  "organizationMembers",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: varchar("organizationId", { length: 64 }).notNull(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["admin", "member"]).notNull().default("member"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("organization_membership_unique").on(table.organizationId, table.userId)]
);

export const employees = mysqlTable(
  "employees",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    role: varchar("role", { length: 160 }).notNull(),
    team: varchar("team", { length: 160 }).notNull().default("Platform Engineering"),
    status: mysqlEnum("status", ["active", "departed", "on_leave"]).notNull().default("active"),
    profileSummary: text("profileSummary"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("employees_name_unique").on(table.name)]
);

export const projects = mysqlTable(
  "projects",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    component: varchar("component", { length: 160 }).notNull(),
    description: text("description"),
    criticality: mysqlEnum("criticality", ["low", "medium", "high", "critical"])
      .notNull()
      .default("medium"),
    ownerEmployeeId: int("ownerEmployeeId").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("projects_name_component_unique").on(table.name, table.component)]
);

export const events = mysqlTable("events", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 64 }).notNull().unique(),
  eventType: mysqlEnum("eventType", [
    "PR_CREATED",
    "CODE_CHANGED",
    "DEPLOYMENT_STARTED",
    "DEPLOYMENT_COMPLETED",
    "INCIDENT_CREATED",
    "INCIDENT_RESOLVED",
    "DOCUMENT_UPDATED",
    "EMPLOYEE_ACTION",
    "CONFIGURATION_CHANGED",
  ]).notNull(),
  employeeId: int("employeeId").references(() => employees.id, { onDelete: "set null" }),
  projectId: int("projectId").references(() => projects.id, { onDelete: "set null" }),
  component: varchar("component", { length: 160 }).notNull(),
  description: text("description").notNull(),
  metadata: text("metadata"),
  eventTimestamp: timestamp("eventTimestamp").notNull(),
  processingStage: mysqlEnum("processingStage", [
    "OBSERVING",
    "ANALYZING",
    "RECALLING",
    "EVALUATING",
    "MONITORING",
    "COMPLETE",
  ])
    .notNull()
    .default("OBSERVING"),
  riskLevel: mysqlEnum("riskLevel", ["observe", "suggestion", "warning", "critical"])
    .notNull()
    .default("observe"),
  analysisSummary: text("analysisSummary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const memories = mysqlTable("memories", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  memoryType: mysqlEnum("memoryType", [
    "Decision",
    "Incident",
    "Workaround",
    "Dependency",
    "Expert Knowledge",
    "Failure",
    "Experiment",
    "Unknown",
    "Conflict",
    "Evidence",
  ]).notNull(),
  source: varchar("source", { length: 160 }).notNull(),
  employeeId: int("employeeId").references(() => employees.id, { onDelete: "set null" }),
  projectId: int("projectId").references(() => projects.id, { onDelete: "set null" }),
  eventId: int("eventId").references(() => events.id, { onDelete: "set null" }),
  component: varchar("component", { length: 160 }).notNull(),
  summary: text("summary").notNull(),
  historicalContext: text("historicalContext"),
  importance: mysqlEnum("importance", ["low", "medium", "high", "critical"])
    .notNull()
    .default("medium"),
  confidence: int("confidence").notNull().default(50),
  status: mysqlEnum("status", ["historical", "current", "superseded", "review"])
    .notNull()
    .default("historical"),
  tags: text("tags"),
  isCurrent: int("isCurrent").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const incidents = mysqlTable(
  "incidents",
  {
    id: int("id").autoincrement().primaryKey(),
    incidentNumber: varchar("incidentNumber", { length: 40 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),
    projectId: int("projectId").references(() => projects.id, { onDelete: "set null" }),
    component: varchar("component", { length: 160 }).notNull(),
    consequence: text("consequence").notNull(),
    rootCause: text("rootCause").notNull(),
    occurredAt: timestamp("occurredAt").notNull(),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("incidents_number_unique").on(table.incidentNumber)]
);

export const failureFingerprints = mysqlTable("failureFingerprints", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  pattern: text("pattern").notNull(),
  criteria: text("criteria").notNull(),
  component: varchar("component", { length: 160 }).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),
  occurrenceCount: int("occurrenceCount").notNull().default(0),
  confidence: int("confidence").notNull().default(50),
  consequence: text("consequence").notNull(),
  recommendation: text("recommendation").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const fingerprintIncidents = mysqlTable(
  "fingerprintIncidents",
  {
    id: int("id").autoincrement().primaryKey(),
    fingerprintId: int("fingerprintId")
      .notNull()
      .references(() => failureFingerprints.id, { onDelete: "cascade" }),
    incidentId: int("incidentId")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
  },
  table => [uniqueIndex("fingerprint_incident_unique").on(table.fingerprintId, table.incidentId)]
);

export const knowledgePatterns = mysqlTable("knowledgePatterns", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 64 }).notNull().unique(),
  patternType: mysqlEnum("patternType", ["shadow", "mutation", "dead_end"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  behavior: text("behavior").notNull(),
  employeeId: int("employeeId").references(() => employees.id, { onDelete: "set null" }),
  projectId: int("projectId").references(() => projects.id, { onDelete: "set null" }),
  component: varchar("component", { length: 160 }).notNull(),
  occurrenceCount: int("occurrenceCount").notNull().default(1),
  documentationStatus: mysqlEnum("documentationStatus", ["not_found", "partial", "documented"])
    .notNull()
    .default("not_found"),
  reason: text("reason"),
  confidence: int("confidence").notNull().default(50),
  importance: mysqlEnum("importance", ["low", "medium", "high", "critical"])
    .notNull()
    .default("medium"),
  status: mysqlEnum("status", ["open", "investigating", "documented", "dismissed"])
    .notNull()
    .default("open"),
  actionTaken: varchar("actionTaken", { length: 80 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const knowledgeGaps = mysqlTable("knowledgeGaps", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  observedBehavior: text("observedBehavior").notNull(),
  knownReason: text("knownReason"),
  component: varchar("component", { length: 160 }).notNull(),
  projectId: int("projectId").references(() => projects.id, { onDelete: "set null" }),
  occurrenceCount: int("occurrenceCount").notNull().default(1),
  documentationStatus: mysqlEnum("documentationStatus", ["not_found", "partial", "documented"])
    .notNull()
    .default("not_found"),
  knowledgeRisk: mysqlEnum("knowledgeRisk", ["low", "medium", "high", "critical"])
    .notNull()
    .default("medium"),
  status: mysqlEnum("status", ["open", "investigating", "resolved", "dismissed"])
    .notNull()
    .default("open"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const conflicts = mysqlTable("conflicts", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  component: varchar("component", { length: 160 }).notNull(),
  historicalClaim: text("historicalClaim").notNull(),
  historicalSource: varchar("historicalSource", { length: 160 }).notNull(),
  currentClaim: text("currentClaim").notNull(),
  currentSource: varchar("currentSource", { length: 160 }).notNull(),
  currentConfidence: int("currentConfidence").notNull().default(50),
  evidenceSummary: text("evidenceSummary").notNull(),
  status: mysqlEnum("status", ["open", "monitoring", "resolved"])
    .notNull()
    .default("open"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const evidence = mysqlTable("evidence", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 64 }).notNull().unique(),
  memoryId: int("memoryId").references(() => memories.id, { onDelete: "set null" }),
  eventId: int("eventId").references(() => events.id, { onDelete: "set null" }),
  incidentId: int("incidentId").references(() => incidents.id, { onDelete: "set null" }),
  source: varchar("source", { length: 160 }).notNull(),
  claim: text("claim").notNull(),
  component: varchar("component", { length: 160 }).notNull(),
  confidence: int("confidence").notNull().default(50),
  evidenceStatus: mysqlEnum("evidenceStatus", ["historical", "current", "verified"])
    .notNull()
    .default("historical"),
  observedAt: timestamp("observedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const warnings = mysqlTable("warnings", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 64 }).notNull().unique(),
  eventId: int("eventId").references(() => events.id, { onDelete: "set null" }),
  fingerprintId: int("fingerprintId").references(() => failureFingerprints.id, {
    onDelete: "set null",
  }),
  severity: mysqlEnum("severity", ["information", "suggestion", "critical"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  action: text("action").notNull(),
  component: varchar("component", { length: 160 }).notNull(),
  potentialImpact: text("potentialImpact").notNull(),
  confidence: int("confidence").notNull().default(50),
  reason: text("reason").notNull(),
  recommendation: text("recommendation").notNull(),
  evidenceSummary: text("evidenceSummary").notNull(),
  status: mysqlEnum("status", ["active", "investigating", "acknowledged", "mitigated", "dismissed"])
    .notNull()
    .default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const handoffSessions = mysqlTable("handoffSessions", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 64 }).notNull().unique(),
  employeeId: int("employeeId")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
  status: mysqlEnum("status", ["draft", "active", "completed"]).notNull().default("draft"),
  handoffRisk: mysqlEnum("handoffRisk", ["low", "medium", "high"]).notNull().default("medium"),
  criticalKnowledgeCount: int("criticalKnowledgeCount").notNull().default(0),
  undocumentedPatternCount: int("undocumentedPatternCount").notNull().default(0),
  dependencyCount: int("dependencyCount").notNull().default(0),
  decisionCount: int("decisionCount").notNull().default(0),
  gapCount: int("gapCount").notNull().default(0),
  transferItems: text("transferItems").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const handoffTestResults = mysqlTable("handoffTestResults", {
  id: int("id").autoincrement().primaryKey(),
  publicId: varchar("publicId", { length: 64 }).notNull().unique(),
  sessionId: int("sessionId")
    .notNull()
    .references(() => handoffSessions.id, { onDelete: "cascade" }),
  answer: text("answer").notNull(),
  coveredItems: text("coveredItems").notNull(),
  missedItems: text("missedItems").notNull(),
  transferPercentage: int("transferPercentage").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const organizationSettings = mysqlTable(
  "organizationSettings",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: varchar("organizationId", { length: 64 }).notNull(),
    agentEnabled: int("agentEnabled").notNull().default(1),
    observationSources: text("observationSources").notNull(),
    notificationLevel: mysqlEnum("notificationLevel", ["silent", "suggestions", "warnings"])
      .notNull()
      .default("warnings"),
    memoryEnabled: int("memoryEnabled").notNull().default(1),
    retentionDays: int("retentionDays").notNull().default(365),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("organization_settings_org_unique").on(table.organizationId)]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Memory = typeof memories.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type Warning = typeof warnings.$inferSelect;
