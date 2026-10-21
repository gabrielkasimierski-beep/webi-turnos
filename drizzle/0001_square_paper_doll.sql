ALTER TABLE "locales" ADD COLUMN "whatsapp_auto" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "locales" ADD COLUMN "mp_user_id" text;--> statement-breakpoint
ALTER TABLE "locales" ADD COLUMN "mp_access_token" text;--> statement-breakpoint
ALTER TABLE "locales" ADD COLUMN "mp_refresh_token" text;--> statement-breakpoint
ALTER TABLE "locales" ADD COLUMN "mp_expira" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "mp_pago_id" text;