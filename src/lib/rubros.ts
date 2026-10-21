/* Rubros: fichas de ejemplo para arrancar el alta de un local en 5 minutos (portado del demo). */
import type { Ficha, Horarios, Sena } from "./tipos";
import { slugify } from "./negocio";

const semana = (abre: string, cierra: string, dias: number[]) => {
  const h: Horarios = {}; for (let i = 0; i < 7; i++) h[i] = dias.includes(i) ? { abre, cierra } : null; return h;
};

type Rubro = {
  rubro: string; nombre: string; color: string; palabra: string; recurso: string; recursos: string[];
  servicios: [string, number, number, string][]; horarios: Horarios; faqs: [string, string][];
};

export const RUBROS: Record<string, Rubro> = {
  barberia: { rubro: "Barbería", nombre: "Barbería El Faro", color: "#A86D21", palabra: "turno", recurso: "barbero",
    recursos: ["Nico", "Ale", "Fran"], servicios: [["Corte", 7000, 30, "cortar, cortarme, pelo, rapado, degradé, fade"], ["Corte + barba", 10000, 45, "corte y barba, completo, pelo y barba"], ["Perfilado de barba", 4500, 20, "barba, afeitar, afeitado, perfilar"], ["Color / platinado", 16000, 90, "tintura, teñir, platinado, decoloración, mechas, color"]],
    horarios: semana("10:00", "20:00", [1, 2, 3, 4, 5, 6]),
    faqs: [["¿Aceptan tarjeta o Mercado Pago?", "Sí: efectivo, tarjeta, transferencia o Mercado Pago."], ["¿Cortan a nenes?", "Sí, el corte infantil sale igual que el corte común."]] },
  estetica: { rubro: "Peluquería y estética", nombre: "Estudio Lumi", color: "#B04F78", palabra: "turno", recurso: "profesional",
    recursos: ["Caro", "Meli"], servicios: [["Corte y brushing", 12000, 60, "corte, cortarme, brushing, peinado"], ["Color", 28000, 120, "tintura, teñir, mechas, reflejos, raíz"], ["Alisado", 45000, 150, "keratina, botox, alisar"], ["Limpieza facial", 18000, 60, "facial, cutis, limpieza"]],
    horarios: semana("09:00", "19:00", [2, 3, 4, 5, 6]),
    faqs: [["¿Tengo que llevar algo?", "No hace falta, tenemos todos los productos."], ["¿Cuánto tarda el color?", "Entre 2 y 3 horas, según el largo del pelo."]] },
  unas: { rubro: "Uñas y pestañas", nombre: "Nail Bar Flor", color: "#9B4DCA", palabra: "turno", recurso: "manicura",
    recursos: ["Flor", "Juli"], servicios: [["Semipermanente", 9000, 60, "semi, esmaltado, uñas"], ["Kapping", 13000, 90, "kaping, capping"], ["Esculpidas", 18000, 120, "acrílicas, gel, esculpir"], ["Lifting de pestañas", 15000, 60, "pestañas, lifting"]],
    horarios: semana("10:00", "20:00", [1, 2, 3, 4, 5, 6]),
    faqs: [["¿Cuánto dura el semipermanente?", "Entre 2 y 3 semanas, según el cuidado."], ["¿Hacen retiro de otro lugar?", "Sí, el retiro se cobra aparte: $3.000."]] },
  consultorio: { rubro: "Consultorio", nombre: "Kinesio Norte", color: "#2F7A8C", palabra: "turno", recurso: "profesional",
    recursos: ["Lic. Paz", "Lic. Romero"], servicios: [["Sesión de kinesiología", 15000, 40, "sesión, kinesio, kine, rehabilitación"], ["Primera consulta", 20000, 60, "primera vez, evaluación, consulta"], ["Masaje descontracturante", 17000, 50, "masaje, masajes, contractura"]],
    horarios: semana("08:00", "20:00", [1, 2, 3, 4, 5]),
    faqs: [["¿Atienden por obra social?", "Por ahora atendemos en forma particular y te damos factura para el reintegro."], ["¿Necesito orden médica?", "Para la primera consulta no. Si tenés estudios, traelos."]] },
  cancha: { rubro: "Canchas de pádel", nombre: "Pádel Club Sur", color: "#2F8A4A", palabra: "reserva", recurso: "cancha",
    recursos: ["Cancha 1", "Cancha 2", "Cancha 3"], servicios: [["Turno de 60 min", 24000, 60, "una hora, 1 hora, 60 minutos"], ["Turno de 90 min", 34000, 90, "hora y media, 90 minutos"]],
    horarios: semana("08:00", "23:00", [0, 1, 2, 3, 4, 5, 6]),
    faqs: [["¿Alquilan paletas?", "Sí, a $2.000 cada una."], ["¿Hay vestuarios?", "Sí, con duchas."]] },
  taller: { rubro: "Taller mecánico", nombre: "Taller Rivas", color: "#C0581E", palabra: "turno", recurso: "box",
    recursos: ["Box 1", "Box 2"], servicios: [["Cambio de aceite y filtro", 45000, 60, "aceite, filtro"], ["Service completo", 120000, 180, "service, mantenimiento"], ["Alineación y balanceo", 35000, 60, "alinear, alineación, balancear, balanceo, tren delantero"], ["Diagnóstico", 15000, 30, "revisar, revisión, ruido, falla, scanner"]],
    horarios: semana("08:00", "17:00", [1, 2, 3, 4, 5]),
    faqs: [["¿Puedo esperar mientras lo arreglan?", "Sí, hay sala de espera con wifi."], ["¿Dan auto de cortesía?", "No tenemos auto de cortesía."]] },
  resto: { rubro: "Restaurante", nombre: "Bodegón Doña Rosa", color: "#9C3B2E", palabra: "reserva", recurso: "mesa",
    recursos: ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5"], servicios: [["Mesa para 2", 0, 90, "2 personas, dos personas, pareja, somos 2, somos dos"], ["Mesa para 4", 0, 90, "4 personas, cuatro personas, somos 4, somos cuatro"], ["Mesa para 6", 0, 120, "6 personas, seis personas, somos 6, somos seis"]],
    horarios: semana("20:00", "23:59", [0, 2, 3, 4, 5, 6]),
    faqs: [["¿Tienen platos sin TACC?", "Tenemos algunos platos sin TACC. Avisanos al reservar."], ["¿Se puede ir con mascota?", "Sí, en las mesas de la vereda."]] },
};

/** Seña de ejemplo por rubro: solo canchas y restaurantes la piden. */
const SENAS: Record<string, Sena> = {
  cancha: { activa: true, obligatoria: true, tipo: "fijo", monto: 5000, alias: "padelclubsur.mp", nota: "Se descuenta del total al jugar." },
  resto: { activa: true, obligatoria: false, tipo: "fijo", monto: 3000, alias: "donarosa.mp", nota: "Por persona, se descuenta del consumo." },
};

function idsUnicos(nombres: string[]) {
  const vistos: Record<string, number> = {};
  return nombres.map((n) => { const id = slugify(n); let k = id, i = 2; while (vistos[k]) k = id + "-" + (i++); vistos[k] = 1; return k; });
}

/** Arma una ficha completa a partir de un rubro de ejemplo (el id de cada recurso/servicio sale del nombre). */
export function armarFicha(clave: string, slug = "", nombre?: string): Ficha {
  const r = RUBROS[clave] || RUBROS.barberia;
  const rid = idsUnicos(r.recursos), sid = idsUnicos(r.servicios.map((s) => s[0]));
  return {
    slug, rubroClave: RUBROS[clave] ? clave : "barberia", rubro: r.rubro, nombre: nombre || r.nombre, color: r.color, palabra: r.palabra, recurso: r.recurso,
    direccion: "", whatsapp: "", instagram: "", logo: "",
    recursos: r.recursos.map((n, i) => ({ id: rid[i], nombre: n })),
    servicios: r.servicios.map((s, i) => ({ id: sid[i], nombre: s[0], precio: s[1], duracion: s[2], alias: s[3] || "", sena: null })),
    horarios: JSON.parse(JSON.stringify(r.horarios)),
    faqs: r.faqs.map((f) => ({ p: f[0], r: f[1] })),
    intervalo: 30, anticipacion: 14, recordatorioHoras: 24, pedirConfirmacion: true,
    sena: SENAS[clave] ? { ...SENAS[clave] } : { activa: false, obligatoria: false, tipo: "fijo", monto: 0, alias: "", nota: "" },
    fidelidad: { activa: false, cadaCuantos: 5, premio: "" },
    whatsappAuto: true, mpConectado: false,
  };
}
