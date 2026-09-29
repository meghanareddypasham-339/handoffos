CREATE TABLE `conflicts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`component` varchar(160) NOT NULL,
	`historicalClaim` text NOT NULL,
	`historicalSource` varchar(160) NOT NULL,
	`currentClaim` text NOT NULL,
	`currentSource` varchar(160) NOT NULL,
	`currentConfidence` int NOT NULL DEFAULT 50,
	`evidenceSummary` text NOT NULL,
	`status` enum('open','monitoring','resolved') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conflicts_id` PRIMARY KEY(`id`),
	CONSTRAINT `conflicts_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`role` varchar(160) NOT NULL,
	`team` varchar(160) NOT NULL DEFAULT 'Platform Engineering',
	`status` enum('active','departed','on_leave') NOT NULL DEFAULT 'active',
	`profileSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`eventType` enum('PR_CREATED','CODE_CHANGED','DEPLOYMENT_STARTED','DEPLOYMENT_COMPLETED','INCIDENT_CREATED','INCIDENT_RESOLVED','DOCUMENT_UPDATED','EMPLOYEE_ACTION','CONFIGURATION_CHANGED') NOT NULL,
	`employeeId` int,
	`projectId` int,
	`component` varchar(160) NOT NULL,
	`description` text NOT NULL,
	`metadata` text,
	`eventTimestamp` timestamp NOT NULL,
	`processingStage` enum('OBSERVING','ANALYZING','RECALLING','EVALUATING','MONITORING','COMPLETE') NOT NULL DEFAULT 'OBSERVING',
	`riskLevel` enum('observe','suggestion','warning','critical') NOT NULL DEFAULT 'observe',
	`analysisSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `events_id` PRIMARY KEY(`id`),
	CONSTRAINT `events_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`memoryId` int,
	`eventId` int,
	`incidentId` int,
	`source` varchar(160) NOT NULL,
	`claim` text NOT NULL,
	`component` varchar(160) NOT NULL,
	`confidence` int NOT NULL DEFAULT 50,
	`evidenceStatus` enum('historical','current','verified') NOT NULL DEFAULT 'historical',
	`observedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidence_id` PRIMARY KEY(`id`),
	CONSTRAINT `evidence_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `failureFingerprints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`pattern` text NOT NULL,
	`criteria` text NOT NULL,
	`component` varchar(160) NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL,
	`occurrenceCount` int NOT NULL DEFAULT 0,
	`confidence` int NOT NULL DEFAULT 50,
	`consequence` text NOT NULL,
	`recommendation` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `failureFingerprints_id` PRIMARY KEY(`id`),
	CONSTRAINT `failureFingerprints_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `fingerprintIncidents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fingerprintId` int NOT NULL,
	`incidentId` int NOT NULL,
	CONSTRAINT `fingerprintIncidents_id` PRIMARY KEY(`id`),
	CONSTRAINT `fingerprint_incident_unique` UNIQUE(`fingerprintId`,`incidentId`)
);
--> statement-breakpoint
CREATE TABLE `handoffSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`employeeId` int NOT NULL,
	`createdByUserId` int,
	`status` enum('draft','active','completed') NOT NULL DEFAULT 'draft',
	`handoffRisk` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`criticalKnowledgeCount` int NOT NULL DEFAULT 0,
	`undocumentedPatternCount` int NOT NULL DEFAULT 0,
	`dependencyCount` int NOT NULL DEFAULT 0,
	`decisionCount` int NOT NULL DEFAULT 0,
	`gapCount` int NOT NULL DEFAULT 0,
	`transferItems` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `handoffSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `handoffSessions_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `handoffTestResults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`sessionId` int NOT NULL,
	`answer` text NOT NULL,
	`coveredItems` text NOT NULL,
	`missedItems` text NOT NULL,
	`transferPercentage` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `handoffTestResults_id` PRIMARY KEY(`id`),
	CONSTRAINT `handoffTestResults_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`incidentNumber` varchar(40) NOT NULL,
	`title` varchar(255) NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL,
	`projectId` int,
	`component` varchar(160) NOT NULL,
	`consequence` text NOT NULL,
	`rootCause` text NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `incidents_id` PRIMARY KEY(`id`),
	CONSTRAINT `incidents_number_unique` UNIQUE(`incidentNumber`)
);
--> statement-breakpoint
CREATE TABLE `knowledgeGaps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`observedBehavior` text NOT NULL,
	`knownReason` text,
	`component` varchar(160) NOT NULL,
	`projectId` int,
	`occurrenceCount` int NOT NULL DEFAULT 1,
	`documentationStatus` enum('not_found','partial','documented') NOT NULL DEFAULT 'not_found',
	`knowledgeRisk` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('open','investigating','resolved','dismissed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledgeGaps_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledgeGaps_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `knowledgePatterns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`patternType` enum('shadow','mutation','dead_end') NOT NULL,
	`title` varchar(255) NOT NULL,
	`behavior` text NOT NULL,
	`employeeId` int,
	`projectId` int,
	`component` varchar(160) NOT NULL,
	`occurrenceCount` int NOT NULL DEFAULT 1,
	`documentationStatus` enum('not_found','partial','documented') NOT NULL DEFAULT 'not_found',
	`reason` text,
	`confidence` int NOT NULL DEFAULT 50,
	`importance` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('open','investigating','documented','dismissed') NOT NULL DEFAULT 'open',
	`actionTaken` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledgePatterns_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledgePatterns_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`memoryType` enum('Decision','Incident','Workaround','Dependency','Expert Knowledge','Failure','Experiment','Unknown','Conflict','Evidence') NOT NULL,
	`source` varchar(160) NOT NULL,
	`employeeId` int,
	`projectId` int,
	`eventId` int,
	`component` varchar(160) NOT NULL,
	`summary` text NOT NULL,
	`historicalContext` text,
	`importance` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`confidence` int NOT NULL DEFAULT 50,
	`status` enum('historical','current','superseded','review') NOT NULL DEFAULT 'historical',
	`tags` text,
	`isCurrent` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `memories_id` PRIMARY KEY(`id`),
	CONSTRAINT `memories_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `organizationSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` varchar(64) NOT NULL,
	`agentEnabled` int NOT NULL DEFAULT 1,
	`observationSources` text NOT NULL,
	`notificationLevel` enum('silent','suggestions','warnings') NOT NULL DEFAULT 'warnings',
	`memoryEnabled` int NOT NULL DEFAULT 1,
	`retentionDays` int NOT NULL DEFAULT 365,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizationSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_settings_org_unique` UNIQUE(`organizationId`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`component` varchar(160) NOT NULL,
	`description` text,
	`criticality` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`ownerEmployeeId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `projects_name_component_unique` UNIQUE(`name`,`component`)
);
--> statement-breakpoint
CREATE TABLE `warnings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(64) NOT NULL,
	`eventId` int,
	`fingerprintId` int,
	`severity` enum('information','suggestion','critical') NOT NULL,
	`title` varchar(255) NOT NULL,
	`action` text NOT NULL,
	`component` varchar(160) NOT NULL,
	`potentialImpact` text NOT NULL,
	`confidence` int NOT NULL DEFAULT 50,
	`reason` text NOT NULL,
	`recommendation` text NOT NULL,
	`evidenceSummary` text NOT NULL,
	`status` enum('active','investigating','acknowledged','mitigated','dismissed') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `warnings_id` PRIMARY KEY(`id`),
	CONSTRAINT `warnings_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_memoryId_memories_id_fk` FOREIGN KEY (`memoryId`) REFERENCES `memories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_eventId_events_id_fk` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_incidentId_incidents_id_fk` FOREIGN KEY (`incidentId`) REFERENCES `incidents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fingerprintIncidents` ADD CONSTRAINT `fingerprintIncidents_fingerprintId_failureFingerprints_id_fk` FOREIGN KEY (`fingerprintId`) REFERENCES `failureFingerprints`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fingerprintIncidents` ADD CONSTRAINT `fingerprintIncidents_incidentId_incidents_id_fk` FOREIGN KEY (`incidentId`) REFERENCES `incidents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `handoffSessions` ADD CONSTRAINT `handoffSessions_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `handoffSessions` ADD CONSTRAINT `handoffSessions_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `handoffTestResults` ADD CONSTRAINT `handoffTestResults_sessionId_handoffSessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `handoffSessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `incidents` ADD CONSTRAINT `incidents_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledgeGaps` ADD CONSTRAINT `knowledgeGaps_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledgePatterns` ADD CONSTRAINT `knowledgePatterns_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledgePatterns` ADD CONSTRAINT `knowledgePatterns_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memories` ADD CONSTRAINT `memories_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memories` ADD CONSTRAINT `memories_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memories` ADD CONSTRAINT `memories_eventId_events_id_fk` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_ownerEmployeeId_employees_id_fk` FOREIGN KEY (`ownerEmployeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warnings` ADD CONSTRAINT `warnings_eventId_events_id_fk` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `warnings` ADD CONSTRAINT `warnings_fingerprintId_failureFingerprints_id_fk` FOREIGN KEY (`fingerprintId`) REFERENCES `failureFingerprints`(`id`) ON DELETE set null ON UPDATE no action;