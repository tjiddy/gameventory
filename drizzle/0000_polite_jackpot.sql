CREATE TABLE `game_expansions` (
	`base_game_id` integer NOT NULL,
	`expansion_game_id` integer NOT NULL,
	PRIMARY KEY(`base_game_id`, `expansion_game_id`),
	FOREIGN KEY (`base_game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expansion_game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `game_stat_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`sampled_day` text NOT NULL,
	`rating_avg` real,
	`rating_bavg` real,
	`rank` integer,
	`weight_avg` real,
	`rating_votes` integer,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_stat_history_game_id_sampled_day_unique` ON `game_stat_history` (`game_id`,`sampled_day`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bgg_id` integer NOT NULL,
	`type` text NOT NULL,
	`hydrated` integer DEFAULT false NOT NULL,
	`owned` integer NOT NULL,
	`played` integer NOT NULL,
	`create_time` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`tagline` text,
	`bgg_url` text,
	`thumbnail` text,
	`image` text,
	`year_published` integer,
	`min_players` integer,
	`max_players` integer,
	`playtime` integer,
	`min_playtime` integer,
	`max_playtime` integer,
	`rating_avg` real,
	`rating_bavg` real,
	`rating_stdev` real,
	`rating_votes` integer,
	`weight_avg` real,
	`weight_votes` integer,
	`rank` integer,
	`is_cooperative` integer DEFAULT false NOT NULL,
	`is_legacy` integer DEFAULT false NOT NULL,
	`is_campaign` integer DEFAULT false NOT NULL,
	`is_18xx` integer DEFAULT false NOT NULL,
	`designers` text,
	`publishers` text,
	`artists` text,
	`families` text,
	`categories` text,
	`mechanics` text,
	`update_time` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_bgg_id_unique` ON `games` (`bgg_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`email` text,
	`display_name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_provider_subject_unique` ON `users` (`provider`,`subject`);