CREATE TABLE `organizationMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`role` enum('admin','member') NOT NULL DEFAULT 'member',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organizationMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_membership_unique` UNIQUE(`organizationId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `organizationMembers` ADD CONSTRAINT `organizationMembers_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;