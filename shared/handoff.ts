import { z } from "zod";

export const eventTypes = [
  "PR_CREATED",
  "CODE_CHANGED",
  "DEPLOYMENT_STARTED",
  "DEPLOYMENT_COMPLETED",
  "INCIDENT_CREATED",
  "INCIDENT_RESOLVED",
  "DOCUMENT_UPDATED",
  "EMPLOYEE_ACTION",
  "CONFIGURATION_CHANGED",
] as const;

export const riskLevels = ["observe", "suggestion", "warning", "critical"] as const;
export const warningSeverities = ["information", "suggestion", "critical"] as const;

export const eventInputSchema = z.object({
  eventType: z.enum(eventTypes),
  employee: z.string().trim().min(2).max(160),
  project: z.string().trim().min(2).max(160).default("FinPay"),
  component: z.string().trim().min(2).max(160),
  description: z.string().trim().min(5).max(5000),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  timestamp: z.string().datetime().optional(),
});

export const memoryInputSchema = z.object({
  title: z.string().trim().min(3).max(255),
  memoryType: z.enum([
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
  ]),
  source: z.string().trim().min(2).max(160),
  employee: z.string().trim().min(2).max(160).optional(),
  project: z.string().trim().min(2).max(160).optional().default("FinPay"),
  component: z.string().trim().min(2).max(160),
  summary: z.string().trim().min(5).max(5000),
  historicalContext: z.string().trim().max(5000).optional(),
  importance: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  confidence: z.number().int().min(0).max(100).default(70),
  status: z.enum(["historical", "current", "superseded", "review"]).default("historical"),
  tags: z.array(z.string().trim().min(1).max(50)).max(12).optional().default([]),
});

export const patternActionSchema = z.object({
  action: z.enum(["investigate", "document", "dismiss"]),
});

export const warningActionSchema = z.object({
  status: z.enum(["active", "investigating", "acknowledged", "mitigated", "dismissed"]),
});

export const settingsInputSchema = z.object({
  agentEnabled: z.boolean(),
  observationSources: z.array(z.enum(["GitHub", "Jira", "Docs", "CI/CD", "Simulated Events"])).min(1),
  notificationLevel: z.enum(["silent", "suggestions", "warnings"]),
  memoryEnabled: z.boolean(),
  retentionDays: z.number().int().min(30).max(3650),
});

export const handoffInputSchema = z.object({
  employee: z.string().trim().min(2).max(160).default("Maya"),
  simulateDeparture: z.boolean().default(false),
});

export const handoffTestInputSchema = z.object({
  sessionId: z.number().int().positive().optional(),
  answer: z.string().trim().min(5).max(5000),
});

export const memoryQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  type: z.string().trim().max(40).optional(),
  importance: z.string().trim().max(20).optional(),
  status: z.string().trim().max(20).optional(),
  sort: z.enum(["recent", "confidence", "importance"]).optional().default("recent"),
});

export type EventInput = z.infer<typeof eventInputSchema>;
export type MemoryInput = z.infer<typeof memoryInputSchema>;
export type SettingsInput = z.infer<typeof settingsInputSchema>;
