/* Locales de ejemplo para probar y mostrar la demo en vivo en la calle.
   Es idempotente: si el local ya existe en Neon de una versión anterior sin contraseña,
   le asegura la clave `demo1234` y el alias de seña para que la demo ande siempre.
   Dueños de prueba (contraseña `demo1234`): demo@webi.local y padel@webi.local */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ahoraAR, iso } from "@/lib/negocio";
import { hashearClave } from "./auth";
import { crearLocal, guardarFicha, localPorSlug, reservar, turnoAtendidoManual, usuarioPorMail } from "./repo";

const dia = (offset: number) => { const d = ahoraAR(); d.setDate(d.getDate() + offset); return iso(d); };

/** WhatsApp de contacto de Webi: el mismo que ve el cliente en la demo. */
const WA_SOPORTE = "5491156328481";

export async function sembrar() {
  const hashDemo = hashearClave("demo1234");
  const db = await getDb();

  const faroExistente = await localPorSlug("barberia-el-faro");
  if (!faroExistente) {
    const { id } = await crearLocal({ nombre: "Barbería El Faro", rubroClave: "barberia", mail: "demo@webi.local", claveHash: hashDemo, whatsapp: WA_SOPORTE });
    const loc = (await localPorSlug("barberia-el-faro"))!;
    const f = {
      ...loc.ficha,
      direccion: "Av. Corrientes 1234, CABA",
      whatsapp: WA_SOPORTE,
      instagram: "@barberiaelfaro",
      sena: { ...loc.ficha.sena, activa: true, obligatoria: false, tipo: "porcentaje" as const, monto: 30, alias: "barberia.faro.mp", nota: "A nombre de Barbería El Faro" },
      fidelidad: { activa: true, cadaCuantos: 5, premio: "un corte gratis" },
    };
    await guardarFicha(id, f);
    const corte = f.servicios[0], nico = f.recursos[0];
    for (const off of [-35, -28, -21, -14]) await turnoAtendidoManual(id, { servicioId: corte.id, recursoId: nico.id, fecha: dia(off), hora: "11:00", nombre: "Lucas Pérez", tel: "11 5555 1234", pago: "Efectivo" });
    await turnoAtendidoManual(id, { servicioId: f.servicios[1].id, recursoId: f.recursos[1].id, fecha: dia(-2), hora: "17:30", nombre: "Mateo Ruiz", tel: "11 4444 9876", pago: "Mercado Pago" });
    for (const off of [1, 2, 3]) {
      const r = await reservar(id, { servicioId: corte.id, recursoId: nico.id, fecha: dia(off), hora: "11:00", nombre: "Lucas Pérez", tel: "11 5555 1234", origen: "chat" });
      if (r.ok) break;
    }
  } else {
    const u = await usuarioPorMail("demo@webi.local");
    if (u && !u.claveHash) {
      await db.update(schema.usuarios).set({ claveHash: hashDemo, intentosFallidos: 0, bloqueadoHasta: null }).where(eq(schema.usuarios.id, u.id));
    }
    if (!faroExistente.ficha.sena?.alias) {
      await guardarFicha(faroExistente.id, {
        ...faroExistente.ficha,
        sena: { ...faroExistente.ficha.sena, activa: true, obligatoria: false, tipo: "porcentaje", monto: 30, alias: "barberia.faro.mp", nota: "A nombre de Barbería El Faro" },
      });
    }
    // La demo va sin foto propia (usa el ícono) y con el WhatsApp de Webi.
    const faro2 = (await localPorSlug("barberia-el-faro"))!;
    if (faro2.ficha.logo || faro2.ficha.whatsapp !== WA_SOPORTE) {
      await guardarFicha(faro2.id, { ...faro2.ficha, logo: "", whatsapp: WA_SOPORTE });
    }
  }

  if (!(await localPorSlug("padel-club-sur"))) {
    const { id } = await crearLocal({ nombre: "Pádel Club Sur", rubroClave: "cancha", mail: "padel@webi.local", claveHash: hashDemo });
    const loc = (await localPorSlug("padel-club-sur"))!;
    await reservar(id, { servicioId: loc.ficha.servicios[0].id, recursoId: loc.ficha.recursos[0].id, fecha: dia(1), hora: "19:00", nombre: "Sofi Díaz", tel: "11 6666 1111", origen: "chat" });
  } else {
    const uPadel = await usuarioPorMail("padel@webi.local");
    if (uPadel && !uPadel.claveHash) {
      await db.update(schema.usuarios).set({ claveHash: hashDemo, intentosFallidos: 0, bloqueadoHasta: null }).where(eq(schema.usuarios.id, uPadel.id));
    }
  }
}
