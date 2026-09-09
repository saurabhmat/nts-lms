ALTER TABLE "analyses" DROP CONSTRAINT "analyses_band_id_analysis_bands_id_fk";
--> statement-breakpoint
ALTER TABLE "analyses" ALTER COLUMN "band_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_band_id_analysis_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."analysis_bands"("id") ON DELETE set null ON UPDATE no action;