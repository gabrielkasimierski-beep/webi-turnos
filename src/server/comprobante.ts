/* =====================================================================
   LECTOR Y VERIFICADOR DE COMPROBANTES (SERVIDOR)
   Extrae el texto de la captura del comprobante mediante OCR (Tesseract.js,
   100% gratis y sin claves externas), reutilizando el worker en caliente
   en memoria para minimizar consumo de CPU en Vercel, y valida importe, fecha
   y destinatario con las reglas puras de `src/lib/comprobante.ts`.
   ===================================================================== */
import os from "node:os";
import { createWorker, type Worker } from "tesseract.js";
import { validarTextoComprobante, type Destino, type ResultadoComprobante } from "@/lib/comprobante";

const MAX_LEN_DATA_URL = 450_000; // ~330 KB en base64
const RE_DATA_IMAGE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/;

const g = globalThis as unknown as {
  __ocrWorker?: Promise<Worker>;
  __ocrCola?: Promise<unknown>;
};

async function obtenerWorker(): Promise<Worker> {
  if (!g.__ocrWorker) {
    g.__ocrWorker = createWorker("spa", 1, {
      cachePath: os.tmpdir(),
      logger: () => {},
    }).catch((e) => {
      g.__ocrWorker = undefined;
      throw e;
    });
  }
  return g.__ocrWorker;
}

/**
 * Segunda versión de la imagen para leer el texto claro sobre banners de color (ahí los bancos ponen
 * "rechazada", "pendiente", etc., y el OCR normal no lo ve): el texto oscuro y el texto claro rodeado de color
 * quedan negros; el resto, blanco. Si sharp no está disponible devuelve null y se usa solo la lectura normal.
 */
async function versionBanners(buf: Buffer): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const n = info.width * info.height, sat = Buffer.alloc(n), lum = Buffer.alloc(n);
    for (let i = 0, p = 0; i < n; i++, p += info.channels) {
      const r = data[p], v = data[p + 1], b = data[p + 2], mx = Math.max(r, v, b), mn = Math.min(r, v, b);
      sat[i] = mx ? Math.round(((mx - mn) / mx) * 255) : 0;
      lum[i] = Math.round(0.299 * r + 0.587 * v + 0.114 * b);
    }
    const satCerca = await sharp(sat, { raw: { width: info.width, height: info.height, channels: 1 } }).blur(12).raw().toBuffer();
    const out = Buffer.alloc(n);
    for (let i = 0; i < n; i++) out[i] = lum[i] < 110 || (lum[i] > 200 && satCerca[i] > 70) ? 0 : 255;
    return await sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
  } catch {
    return null;
  }
}

/** Extrae el texto de una imagen en formato Data URL (`data:image/...;base64,...`) encolando en el worker compartido. */
export async function leerTextoImagen(imagenDataUrl: string): Promise<string> {
  const m = imagenDataUrl.match(RE_DATA_IMAGE);
  if (!m) throw new Error("Formato de imagen inválido.");
  const buf = Buffer.from(m[2], "base64");

  const tarea = (g.__ocrCola || Promise.resolve()).then(async () => {
    let worker: Worker;
    let texto = "";
    try {
      worker = await obtenerWorker();
      texto = (await worker.recognize(buf)).data.text || "";
    } catch (e) {
      g.__ocrWorker = undefined;
      throw e;
    }
    // Lectura extra de banners: si falla, no afecta el resultado de la lectura normal.
    try {
      const banners = await versionBanners(buf);
      if (banners) texto += "\n" + ((await worker.recognize(banners)).data.text || "");
    } catch { /* se queda con la lectura normal */ }
    return texto;
  });
  g.__ocrCola = tarea.catch(() => {});
  return tarea;
}

/**
   Verifica que la imagen sea un comprobante válido cuyo importe coincida con `montoEsperado`,
   cuya fecha esté entre `fechasValidas` (ej. la fecha de hoy en Argentina) y que sea para `destino`.
 */
export async function verificarComprobanteImagen(
  imagenDataUrl: string,
  montoEsperado: number,
  fechasValidas: string[],
  destino?: Destino,
): Promise<ResultadoComprobante> {
  if (typeof imagenDataUrl !== "string" || !imagenDataUrl) {
    return { ok: false, motivo: "Falta la imagen del comprobante." };
  }
  if (imagenDataUrl.length > MAX_LEN_DATA_URL) {
    return { ok: false, motivo: "La imagen es demasiado pesada. Subí una captura más liviana." };
  }
  if (!RE_DATA_IMAGE.test(imagenDataUrl)) {
    return { ok: false, motivo: "Subí una imagen válida (JPG, PNG o WebP) del comprobante." };
  }

  try {
    const texto = await leerTextoImagen(imagenDataUrl);
    return validarTextoComprobante(texto, montoEsperado, fechasValidas, destino);
  } catch (e) {
    console.error("[comprobante] Error leyendo imagen con OCR:", e);
    return {
      ok: false,
      motivo: "No pude procesar la imagen del comprobante. Probá con una captura más clara.",
    };
  }
}
