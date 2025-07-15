CREATE SCHEMA "geoscraper";
--> statement-breakpoint
CREATE TABLE "geoscraper"."tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'queued' NOT NULL,
	"map_type" varchar(50) NOT NULL,
	"bounds" jsonb NOT NULL,
	"zoom_levels" jsonb NOT NULL,
	"concurrency" real DEFAULT 5 NOT NULL,
	"download_delay" real DEFAULT 0.2 NOT NULL,
	"progress" real DEFAULT 0,
	"total_tiles" real DEFAULT 0,
	"completed_tiles" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
