CREATE TABLE "clientes" (
	"id" text PRIMARY KEY NOT NULL,
	"local_id" text NOT NULL,
	"tel" text NOT NULL,
	"tel_clave" text NOT NULL,
	"nombre" text DEFAULT '' NOT NULL,
	"premios_entregados" integer DEFAULT 0 NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codigos_login" (
	"id" text PRIMARY KEY NOT NULL,
	"destino" text NOT NULL,
	"canal" text DEFAULT 'mail' NOT NULL,
	"hash" text NOT NULL,
	"expira" timestamp with time zone NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"usado" boolean DEFAULT false NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locales" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"rubro" text NOT NULL,
	"rubro_clave" text DEFAULT 'barberia' NOT NULL,
	"color" text DEFAULT '#A86D21' NOT NULL,
	"logo" text DEFAULT '' NOT NULL,
	"direccion" text DEFAULT '' NOT NULL,
	"whatsapp" text DEFAULT '' NOT NULL,
	"instagram" text DEFAULT '' NOT NULL,
	"horarios" jsonb NOT NULL,
	"intervalo" integer DEFAULT 30 NOT NULL,
	"anticipacion" integer DEFAULT 14 NOT NULL,
	"palabra" text DEFAULT 'turno' NOT NULL,
	"recurso" text DEFAULT 'profesional' NOT NULL,
	"faqs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recordatorio_horas" integer DEFAULT 24 NOT NULL,
	"pedir_confirmacion" boolean DEFAULT true NOT NULL,
	"sena" jsonb NOT NULL,
	"fidelidad" jsonb NOT NULL,
	"estado_suscripcion" text DEFAULT 'prueba' NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locales_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "recursos" (
	"id" text PRIMARY KEY NOT NULL,
	"local_id" text NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicios" (
	"id" text PRIMARY KEY NOT NULL,
	"local_id" text NOT NULL,
	"nombre" text NOT NULL,
	"precio" integer DEFAULT 0 NOT NULL,
	"duracion" integer DEFAULT 30 NOT NULL,
	"alias" text DEFAULT '' NOT NULL,
	"sena" integer,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turnos" (
	"id" text PRIMARY KEY NOT NULL,
	"local_id" text NOT NULL,
	"fecha" text NOT NULL,
	"hora" text NOT NULL,
	"dur" integer NOT NULL,
	"servicio_id" text NOT NULL,
	"servicio_nombre" text NOT NULL,
	"precio" integer DEFAULT 0 NOT NULL,
	"recurso_id" text NOT NULL,
	"recurso_nombre" text NOT NULL,
	"nombre" text DEFAULT '' NOT NULL,
	"tel" text DEFAULT '' NOT NULL,
	"tel_clave" text DEFAULT '' NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"pago" text,
	"sena_monto" integer DEFAULT 0 NOT NULL,
	"sena_estado" text DEFAULT 'no' NOT NULL,
	"confirmado" boolean DEFAULT false NOT NULL,
	"recordado" timestamp with time zone,
	"origen" text DEFAULT 'chat' NOT NULL,
	"cerrado" timestamp with time zone,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" text PRIMARY KEY NOT NULL,
	"local_id" text NOT NULL,
	"mail" text NOT NULL,
	"whatsapp" text DEFAULT '' NOT NULL,
	"rol" text DEFAULT 'dueno' NOT NULL,
	"creado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recursos" ADD CONSTRAINT "recursos_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_local_id_locales_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."locales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_local_tel_uq" ON "clientes" USING btree ("local_id","tel_clave");--> statement-breakpoint
CREATE INDEX "codigos_destino_idx" ON "codigos_login" USING btree ("destino");--> statement-breakpoint
CREATE INDEX "recursos_local_idx" ON "recursos" USING btree ("local_id");--> statement-breakpoint
CREATE INDEX "servicios_local_idx" ON "servicios" USING btree ("local_id");--> statement-breakpoint
CREATE INDEX "turnos_local_fecha_idx" ON "turnos" USING btree ("local_id","fecha");--> statement-breakpoint
CREATE INDEX "turnos_local_tel_idx" ON "turnos" USING btree ("local_id","tel_clave");--> statement-breakpoint
CREATE UNIQUE INDEX "turnos_slot_uq" ON "turnos" USING btree ("local_id","recurso_id","fecha","hora") WHERE "turnos"."estado" <> 'cancelado';--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_mail_uq" ON "usuarios" USING btree ("mail");