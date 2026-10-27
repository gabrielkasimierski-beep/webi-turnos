export type Horario = { abre: string; cierra: string } | null;
export type Horarios = Record<string, Horario>; // clave: día de la semana 0 (dom) a 6 (sáb)
export type Faq = { p: string; r: string };
export type Sena = { activa: boolean; obligatoria: boolean; tipo: "fijo" | "porcentaje"; monto: number; alias: string; nota: string; titular?: string };
export type Fidelidad = { activa: boolean; cadaCuantos: number; premio: string };

export type Recurso = { id: string; nombre: string };
export type Servicio = { id: string; nombre: string; precio: number; duracion: number; alias: string; sena: number | null };

/** La ficha del local tal como la usan el chat, el panel y la pantalla de configurar (misma forma que el demo). */
export type Ficha = {
  slug: string;
  rubroClave: string;
  rubro: string;
  nombre: string;
  color: string;
  logo: string;
  direccion: string;
  whatsapp: string;
  instagram: string;
  palabra: string;
  recurso: string;
  recursos: Recurso[];
  servicios: Servicio[];
  horarios: Horarios;
  faqs: Faq[];
  intervalo: number;
  anticipacion: number;
  recordatorioHoras: number;
  pedirConfirmacion: boolean;
  sena: Sena;
  fidelidad: Fidelidad;
  whatsappAuto: boolean;
};

export type EstadoTurno = "pendiente" | "atendido" | "no_vino" | "cancelado";
export type EstadoSena = "no" | "pendiente" | "declarada" | "recibida";

export type Turno = {
  id: string;
  fecha: string;
  hora: string;
  dur: number;
  servicioId: string;
  servicioNombre: string;
  precio: number;
  recursoId: string;
  recursoNombre: string;
  nombre: string;
  tel: string;
  estado: EstadoTurno;
  pago: string | null;
  sena: { monto: number; estado: EstadoSena; comprobante?: string | null };
  confirmado: boolean;
  recordado: string | null;
  origen: string;
  creado: string;
};

/** Lo único que el chat público sabe de los turnos ajenos: que el hueco está ocupado (sin nombres ni teléfonos). */
export type Ocupacion = { fecha: string; hora: string; dur: number; recursoId: string; estado?: string; id?: string };

export type ResumenCliente = { telClave: string; visitas: number; ausencias: number; premiosGanados: number; premiosEntregados: number };
