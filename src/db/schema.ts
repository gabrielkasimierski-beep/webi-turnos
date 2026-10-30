import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { Fidelidad, Horarios, Sena, Faq } from "@/lib/tipos";

/* Todo cuelga de `locales`: cada fila de las demás tablas lleva el local_id y TODA query filtra por él. */

export const locales = pgTable("locales", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  nombre: text("nombre").notNull(),
  rubro: text("rubro").notNull(),
  rubroClave: text("rubro_clave").notNull().default("barberia"),
  color: text("color").notNull().default("#A86D21"),
  logo: text("logo").notNull().default(""),
  direccion: text("direccion").notNull().default(""),
  whatsapp: text("whatsapp").notNull().default(""),
  instagram: text("instagram").notNull().default(""),
  horarios: jsonb("horarios").$type<Horarios>().notNull(),
  intervalo: integer("intervalo").notNull().default(30),
  anticipacion: integer("anticipacion").notNull().default(14),
  palabra: text("palabra").notNull().default("turno"), // "turno" | "reserva"
  recurso: text("recurso").notNull().default("profesional"), // cómo se llama lo que se reserva: barbero, cancha, mesa…
  faqs: jsonb("faqs").$type<Faq[]>().notNull().default([]),
  recordatorioHoras: integer("recordatorio_horas").notNull().default(24),
  pedirConfirmacion: boolean("pedir_confirmacion").notNull().default(true),
  sena: jsonb("sena").$type<Sena>().notNull(),
  fidelidad: jsonb("fidelidad").$type<Fidelidad>().notNull(),
  estadoSuscripcion: text("estado_suscripcion").notNull().default("prueba"), // prueba | activa | vencida | cancelada
  whatsappAuto: boolean("whatsapp_auto").notNull().default(true), // recordatorios y confirmaciones automáticas por WhatsApp
  creado: timestamp("creado", { withTimezone: true }).notNull().defaultNow(),
});

export const usuarios = pgTable(
  "usuarios",
  {
    id: text("id").primaryKey(),
    localId: text("local_id").notNull().references(() => locales.id, { onDelete: "cascade" }),
    mail: text("mail").notNull(),
    claveHash: text("clave_hash").notNull().default(""),
    intentosFallidos: integer("intentos_fallidos").notNull().default(0),
    ultimoFallo: timestamp("ultimo_fallo", { withTimezone: true }), // para la ventana deslizante: los fallos de hace +15 min no cuentan
    bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true }),
    whatsapp: text("whatsapp").notNull().default(""), // para el OTP por WhatsApp (Fase 2)
    rol: text("rol").notNull().default("dueno"), // dueno | empleado
    creado: timestamp("creado", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("usuarios_mail_uq").on(t.mail)],
);

/* Códigos de un solo uso del login. Se guarda el hash, nunca el código. */
export const codigosLogin = pgTable(
  "codigos_login",
  {
    id: text("id").primaryKey(),
    destino: text("destino").notNull(), // mail (o whatsapp en Fase 2)
    canal: text("canal").notNull().default("mail"),
    hash: text("hash").notNull(),
    expira: timestamp("expira", { withTimezone: true }).notNull(),
    intentos: integer("intentos").notNull().default(0),
    usado: boolean("usado").notNull().default(false),
    creado: timestamp("creado", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("codigos_destino_idx").on(t.destino)],
);

export const recursos = pgTable(
  "recursos",
  {
    id: text("id").primaryKey(),
    localId: text("local_id").notNull().references(() => locales.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    orden: integer("orden").notNull().default(0),
  },
  (t) => [index("recursos_local_idx").on(t.localId)],
);

export const servicios = pgTable(
  "servicios",
  {
    id: text("id").primaryKey(),
    localId: text("local_id").notNull().references(() => locales.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    precio: integer("precio").notNull().default(0),
    duracion: integer("duracion").notNull().default(30),
    alias: text("alias").notNull().default(""), // "también le dicen": ayuda al intérprete del chat
    sena: integer("sena"), // seña propia de este servicio (monto fijo); null = usa la regla del local
    orden: integer("orden").notNull().default(0),
  },
  (t) => [index("servicios_local_idx").on(t.localId)],
);

export const turnos = pgTable(
  "turnos",
  {
    id: text("id").primaryKey(),
    localId: text("local_id").notNull().references(() => locales.id, { onDelete: "cascade" }),
    fecha: text("fecha").notNull(), // YYYY-MM-DD, hora de Argentina
    hora: text("hora").notNull(), // HH:MM
    dur: integer("dur").notNull(),
    // servicio y recurso: id + nombre copiado, así el historial sobrevive a cambios en la ficha
    servicioId: text("servicio_id").notNull(),
    servicioNombre: text("servicio_nombre").notNull(),
    precio: integer("precio").notNull().default(0),
    recursoId: text("recurso_id").notNull(),
    recursoNombre: text("recurso_nombre").notNull(),
    nombre: text("nombre").notNull().default(""),
    tel: text("tel").notNull().default(""),
    telClave: text("tel_clave").notNull().default(""), // últimos 8 dígitos: identidad del cliente
    estado: text("estado").notNull().default("pendiente"), // pendiente | atendido | no_vino | cancelado
    pago: text("pago"),
    senaMonto: integer("sena_monto").notNull().default(0),
    senaEstado: text("sena_estado").notNull().default("no"), // no | pendiente | declarada | recibida
    senaComprobante: text("sena_comprobante"), // imagen del comprobante verificado (data:image/jpeg;base64,...)
    confirmado: boolean("confirmado").notNull().default(false),
    recordado: timestamp("recordado", { withTimezone: true }),
    origen: text("origen").notNull().default("chat"), // chat | local
    cerrado: timestamp("cerrado", { withTimezone: true }),
    creado: timestamp("creado", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("turnos_local_fecha_idx").on(t.localId, t.fecha),
    index("turnos_local_tel_idx").on(t.localId, t.telClave),
    // dos reservas no pueden arrancar a la misma hora en el mismo recurso (el solapamiento parcial lo valida el código)
    uniqueIndex("turnos_slot_uq").on(t.localId, t.recursoId, t.fecha, t.hora).where(sql`${t.estado} <> 'cancelado'`),
  ],
);

export const clientes = pgTable(
  "clientes",
  {
    id: text("id").primaryKey(),
    localId: text("local_id").notNull().references(() => locales.id, { onDelete: "cascade" }),
    tel: text("tel").notNull(),
    telClave: text("tel_clave").notNull(),
    nombre: text("nombre").notNull().default(""),
    premiosEntregados: integer("premios_entregados").notNull().default(0),
    creado: timestamp("creado", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("clientes_local_tel_uq").on(t.localId, t.telClave)],
);
