import type { EventInput } from "../../shared/handoff";

/**
 * Connector adapters normalize authorized source events before HandoffOS processes
 * them. The MVP only ships the simulated connector; external transports are
 * intentionally declarations, not claimed integrations.
 */
export interface OrganizationalConnector {
  readonly source: "GitHub" | "Jira" | "Slack" | "Microsoft Teams" | "CI/CD" | "Docs" | "Simulated Events";
  normalize(payload: unknown): Promise<EventInput>;
}

export class SimulatedEventsConnector implements OrganizationalConnector {
  readonly source = "Simulated Events" as const;

  async normalize(payload: unknown): Promise<EventInput> {
    return payload as EventInput;
  }
}

export const connectorRoadmap = [
  { source: "GitHub", status: "planned", capability: "Pull requests, code changes, and review events" },
  { source: "Jira", status: "planned", capability: "Tickets, incidents, and project context" },
  { source: "Slack", status: "planned", capability: "Authorized knowledge and decision signals" },
  { source: "Microsoft Teams", status: "planned", capability: "Authorized knowledge and decision signals" },
  { source: "CI/CD", status: "planned", capability: "Deployment and configuration events" },
  { source: "Docs", status: "planned", capability: "Documentation updates and evidence" },
] as const;
