ALTER TABLE "geoscraper"."tasks" ADD COLUMN "verification_status" varchar(50) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "geoscraper"."tasks" ADD COLUMN "verification_progress" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "geoscraper"."tasks" ADD COLUMN "verified_tiles" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "geoscraper"."tasks" ADD COLUMN "missing_tiles" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "geoscraper"."tasks" ADD COLUMN "missing_tile_list" jsonb;