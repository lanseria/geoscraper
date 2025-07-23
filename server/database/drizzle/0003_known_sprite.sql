CREATE TYPE "public"."tile_type" AS ENUM('missing', 'non-existent');--> statement-breakpoint
CREATE TABLE "geoscraper"."task_tiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"z" integer NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"type" "tile_type" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "geoscraper"."task_tiles" ADD CONSTRAINT "task_tiles_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "geoscraper"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geoscraper"."tasks" DROP COLUMN "missing_tile_list";--> statement-breakpoint
ALTER TABLE "geoscraper"."tasks" DROP COLUMN "non_existent_tiles";