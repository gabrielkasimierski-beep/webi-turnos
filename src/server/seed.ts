/* Locales de ejemplo para probar el flujo completo. Es idempotente: si el slug ya existe, no toca nada.
   Dueños de prueba (contraseña inicial `demo1234`): demo@webi.local y padel@webi.local */
import { ahoraAR, iso } from "@/lib/negocio";
import { hashearClave } from "./auth";
import { crearLocal, guardarFicha, localPorSlug, reservar, turnoAtendidoManual } from "./repo";

const dia = (offset: number) => { const d = ahoraAR(); d.setDate(d.getDate() + offset); return iso(d); };

export async function sembrar() {
  const hashDemo = hashearClave("demo1234");
  if (!(await localPorSlug("barberia-el-faro"))) {
    const { id } = await crearLocal({ nombre: "Barbería El Faro", rubroClave: "barberia", mail: "demo@webi.local", claveHash: hashDemo, whatsapp: "5491155550000" });
    const loc = (await localPorSlug("barberia-el-faro"))!;
    const f = {
      ...loc.ficha,
      direccion: "Av. Corrientes 1234, CABA",
      whatsapp: "5491155550000",
      instagram: "@barberiaelfaro",
      sena: { ...loc.ficha.sena, activa: true, obligatoria: false, tipo: "porcentaje" as const, monto: 30, alias: "barberia.faro.mp", nota: "A nombre de Barbería El Faro" },
      fidelidad: { activa: true, cadaCuantos: 5, premio: "un corte gratis" },
    };
    await guardarFicha(id, f);
    const corte = f.servicios[0], nico = f.recursos[0];
    // Una clienta con 4 visitas atendidas: la próxima la deja a una del premio
    for (const off of [-35, -28, -21, -14]) await turnoAtendidoManual(id, { servicioId: corte.id, recursoId: nico.id, fecha: dia(off), hora: "11:00", nombre: "Lucas Pérez", tel: "11 5555 1234", pago: "Efectivo" });
    await turnoAtendidoManual(id, { servicioId: f.servicios[1].id, recursoId: f.recursos[1].id, fecha: dia(-2), hora: "17:30", nombre: "Mateo Ruiz", tel: "11 4444 9876", pago: "Mercado Pago" });
    // Un turno pendiente para mañana, hecho por el camino real de reserva
    for (const off of [1, 2, 3]) {
      const r = await reservar(id, { servicioId: corte.id, recursoId: nico.id, fecha: dia(off), hora: "11:00", nombre: "Lucas Pérez", tel: "11 5555 1234", origen: "chat" });
      if (r.ok) break;
    }
  }
  if (!(await localPorSlug("padel-club-sur"))) {
    const { id } = await crearLocal({ nombre: "Pádel Club Sur", rubroClave: "cancha", mail: "padel@webi.local", claveHash: hashDemo });
    const loc = (await localPorSlug("padel-club-sur"))!;
    await reservar(id, { servicioId: loc.ficha.servicios[0].id, recursoId: loc.ficha.recursos[0].id, fecha: dia(1), hora: "19:00", nombre: "Sofi Díaz", tel: "11 6666 1111", origen: "chat" });
  }
}
