import { and, desc, eq, like, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { conflicts, employees, memories, projects } from "../../drizzle/schema";
import type { MemoryInput } from "../../shared/handoff";
import { getDb } from "../db";

export type MemorySearch = {
  query?: string;
  component?: string;
  limit?: number;
};

export type MemoryUpdate = Partial<Pick<MemoryInput, "summary" | "historicalContext" | "importance" | "confidence" | "status" | "tags">> & {
  isCurrent?: boolean;
};

/**
 * Provider-neutral contract. A future external provider may implement this interface
 * after credentials are explicitly configured; the default stays local and durable.
 */
export interface MemoryService {
  remember(input: MemoryInput & { eventId?: number | null }): Promise<typeof memories.$inferSelect>;
  recall(search: MemorySearch): Promise<(typeof memories.$inferSelect)[]>;
  reflect(component: string): Promise<{ memoryCount: number; highImportanceCount: number; themes: string[] }>;
  updateMemory(memoryId: number, changes: MemoryUpdate): Promise<typeof memories.$inferSelect>;
  findRelatedMemories(text: string, component?: string): Promise<(typeof memories.$inferSelect)[]>;
  detectConflict(input: { component: string; historicalClaim: string; currentClaim: string; currentSource: string; confidence: number; evidenceSummary: string }): Promise<typeof conflicts.$inferSelect | null>;
}

function parseTags(raw: string | null) {
  try {
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export class LocalDatabaseMemoryService implements MemoryService {
  async remember(input: MemoryInput & { eventId?: number | null }) {
    const db = await getDb();
    if (!db) throw new Error("Database is unavailable");

    const employee = input.employee
      ? (await db.select().from(employees).where(eq(employees.name, input.employee)).limit(1))[0]
      : undefined;
    const project = (
      await db
        .select()
        .from(projects)
        .where(and(eq(projects.name, input.project ?? "FinPay"), eq(projects.component, input.component)))
        .limit(1)
    )[0];

    const publicId = `mem_${nanoid(12)}`;
    await db.insert(memories).values({
      publicId,
      title: input.title,
      memoryType: input.memoryType,
      source: input.source,
      employeeId: employee?.id ?? null,
      projectId: project?.id ?? null,
      eventId: input.eventId ?? null,
      component: input.component,
      summary: input.summary,
      historicalContext: input.historicalContext ?? null,
      importance: input.importance,
      confidence: input.confidence,
      status: input.status,
      tags: JSON.stringify(input.tags),
      isCurrent: input.status === "current" ? 1 : 0,
    });

    const created = await db.select().from(memories).where(eq(memories.publicId, publicId)).limit(1);
    if (!created[0]) throw new Error("Memory was not persisted");
    return created[0];
  }

  async recall(search: MemorySearch) {
    const db = await getDb();
    if (!db) throw new Error("Database is unavailable");

    const filters = [];
    if (search.component) filters.push(eq(memories.component, search.component));
    if (search.query) {
      const pattern = `%${search.query}%`;
      filters.push(or(like(memories.title, pattern), like(memories.summary, pattern), like(memories.tags, pattern))!);
    }

    return db
      .select()
      .from(memories)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(memories.createdAt))
      .limit(search.limit ?? 12);
  }

  async reflect(component: string) {
    const related = await this.recall({ component, limit: 100 });
    const themes = Array.from(
      new Set(
        related
          .flatMap(memory => parseTags(memory.tags))
          .filter(Boolean)
          .slice(0, 10)
      )
    );
    return {
      memoryCount: related.length,
      highImportanceCount: related.filter(memory => memory.importance === "high" || memory.importance === "critical").length,
      themes,
    };
  }

  async updateMemory(memoryId: number, changes: MemoryUpdate) {
    const db = await getDb();
    if (!db) throw new Error("Database is unavailable");

    const update: Record<string, unknown> = {};
    if (changes.summary !== undefined) update.summary = changes.summary;
    if (changes.historicalContext !== undefined) update.historicalContext = changes.historicalContext;
    if (changes.importance !== undefined) update.importance = changes.importance;
    if (changes.confidence !== undefined) update.confidence = changes.confidence;
    if (changes.status !== undefined) update.status = changes.status;
    if (changes.tags !== undefined) update.tags = JSON.stringify(changes.tags);
    if (changes.isCurrent !== undefined) update.isCurrent = changes.isCurrent ? 1 : 0;

    if (Object.keys(update).length) await db.update(memories).set(update).where(eq(memories.id, memoryId));
    const updated = await db.select().from(memories).where(eq(memories.id, memoryId)).limit(1);
    if (!updated[0]) throw new Error("Memory not found");
    return updated[0];
  }

  async findRelatedMemories(text: string, component?: string) {
    const keywords = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(word => word.length >= 4)
      .slice(0, 4);
    const query = keywords[0] ?? text;
    return this.recall({ query, component, limit: 16 });
  }

  async detectConflict(input: {
    component: string;
    historicalClaim: string;
    currentClaim: string;
    currentSource: string;
    confidence: number;
    evidenceSummary: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error("Database is unavailable");
    const existing = await db.select().from(conflicts).where(eq(conflicts.component, input.component)).limit(1);
    if (existing[0]) return existing[0];

    const publicId = `conf_${nanoid(12)}`;
    await db.insert(conflicts).values({
      publicId,
      title: `Potential knowledge conflict in ${input.component}`,
      component: input.component,
      historicalClaim: input.historicalClaim,
      historicalSource: "Historical organizational memory",
      currentClaim: input.currentClaim,
      currentSource: input.currentSource,
      currentConfidence: input.confidence,
      evidenceSummary: input.evidenceSummary,
      status: "monitoring",
    });
    const created = await db.select().from(conflicts).where(eq(conflicts.publicId, publicId)).limit(1);
    return created[0] ?? null;
  }
}

/**
 * Environment only selects a future adapter boundary; no external memory API is
 * invoked unless such an adapter is intentionally implemented and configured.
 */
export function getMemoryService(): MemoryService {
  const provider = process.env.HANDOFFOS_MEMORY_PROVIDER;
  if (provider && provider !== "local") {
    console.warn(`[Memory] External provider '${provider}' is configured but no adapter is installed; using local durable memory.`);
  }
  return new LocalDatabaseMemoryService();
}
