import { count, eq, and } from "drizzle-orm";
import { organizationMembers } from "../../drizzle/schema";
import { getDb } from "../db";

export const FINPAY_ORGANIZATION_ID = "finpay";

export class WorkspaceAccessError extends Error {
  constructor(message = "This Manus account is not a member of the FinPay workspace.") {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

/**
 * The first authenticated project user provisions the demo workspace as admin.
 * Later identities must be granted membership explicitly; a valid OAuth session is
 * not by itself authorization to read or mutate FinPay organizational data.
 */
export async function requireFinPayMembership(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [existing] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, FINPAY_ORGANIZATION_ID), eq(organizationMembers.userId, userId)))
    .limit(1);
  if (existing) return existing;

  const [memberCount] = await db
    .select({ total: count() })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, FINPAY_ORGANIZATION_ID));
  if (Number(memberCount?.total ?? 0) > 0) throw new WorkspaceAccessError();

  await db.insert(organizationMembers).values({
    organizationId: FINPAY_ORGANIZATION_ID,
    userId,
    role: "admin",
  });
  const [created] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, FINPAY_ORGANIZATION_ID), eq(organizationMembers.userId, userId)))
    .limit(1);
  if (!created) throw new WorkspaceAccessError("FinPay workspace membership could not be created.");
  return created;
}
