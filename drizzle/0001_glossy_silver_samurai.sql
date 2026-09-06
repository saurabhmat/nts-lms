ALTER TABLE "auth"."users" DROP CONSTRAINT "users_organization_id_organizations_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_members_user_id_uidx" ON "auth"."members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "auth"."users" DROP COLUMN "organization_id";