import { actualizarClaveUsuario, claveValida, enviarAlertaSeguridad, iniciarSesion, verificarClaveDeUsuario } from "@/server/auth";
import { validarFicha } from "@/server/ficha-validar";
import { conLocal, error, json } from "@/server/http";
import { guardarFicha, localPorId } from "@/server/repo";

export async function GET() {
  const l = await conLocal();
  if (!l) return error("Sin sesión.", 401);
  return json({ ok: true, ficha: l.ficha });
}

export async function PUT(req: Request) {
  const l = await conLocal();
  if (!l) return error("Sin sesión.", 401);
  const b = await req.json().catch(() => null);

  // Cambio de contraseña desde el panel (cierra cualquier sesión abierta en otros dispositivos)
  if (b?.cambiarClave) {
    const actual = String(b.claveActual || ""), nueva = String(b.nuevaClave || "");
    if (!claveValida(nueva)) return error("La nueva contraseña debe tener al menos 8 caracteres.");
    if (!(await verificarClaveDeUsuario(l.sesion.usuarioId, actual))) return error("Tu contraseña actual no es correcta.", 403);
    const nuevaSesion = await actualizarClaveUsuario(l.sesion.usuarioId, nueva);
    if (!nuevaSesion) return error("No se pudo actualizar la contraseña.", 500);
    await iniciarSesion(nuevaSesion);
    return json({ ok: true });
  }

  if (!b?.ficha) return error("Pedido inválido.");
  const v = validarFicha(b.ficha, l.ficha);
  if (!v.ok) return error(v.motivo);

  // Si cambia el Alias de cobro de la seña o el WhatsApp del local, exigimos la contraseña actual y avisamos por mail
  const cambioAlias = v.ficha.sena.alias !== l.ficha.sena.alias;
  const cambioWa = v.ficha.whatsapp !== l.ficha.whatsapp;
  if (cambioAlias || cambioWa) {
    const claveActual = String(b.claveActual || "");
    if (!claveActual || !(await verificarClaveDeUsuario(l.sesion.usuarioId, claveActual))) {
      return json(
        {
          ok: false,
          requiereClave: true,
          motivo: "Por seguridad, ingresá tu contraseña actual para modificar el Alias de la seña o el WhatsApp del local.",
        },
        403,
      );
    }
  }

  await guardarFicha(l.localId, v.ficha);

  if (cambioAlias || cambioWa) {
    const detalles: string[] = [];
    if (cambioAlias) detalles.push(`Nuevo Alias de seña: "${v.ficha.sena.alias || "(vacío)"}" (antes: "${l.ficha.sena.alias || "(vacío)"}")`);
    if (cambioWa) detalles.push(`Nuevo WhatsApp del local: "${v.ficha.whatsapp || "(vacío)"}" (antes: "${l.ficha.whatsapp || "(vacío)"}")`);
    await enviarAlertaSeguridad(
      l.sesion.usuarioId,
      "Se modificaron datos sensibles de tu local",
      `En tu local "${v.ficha.nombre}" se actualizaron estos datos:\n• ${detalles.join("\n• ")}`,
    );
  }

  return json({ ok: true, ficha: (await localPorId(l.localId))!.ficha });
}
