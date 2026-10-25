/* =====================================================================
   LECTOR Y VERIFICADOR DE COMPROBANTES (SERVIDOR)
   Extrae el texto de la captura del comprobante mediante OCR (Tesseract.js,
   100% gratis y sin claves externas), reutilizando el worker en caliente
   en memoria para minimizar consumo de CPU en Vercel, y valida importe + fecha
   con las reglas puras de `src/lib/comprobante.ts`.
   ===================================================================== */
import os from "node:os";
import { createWorker, type Worker } from "tesseract.js";
import { validarTextoComprobante, type ResultadoComprobante } from "@/lib/comprobante";

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

/** Extrae el texto de una imagen en formato Data URL (`data:image/...;base64,...`) encolando en el worker compartido. */
export async function leerTextoImagen(imagenDataUrl: string): Promise<string> {
  const m = imagenDataUrl.match(RE_DATA_IMAGE);
  if (!m) throw new Error("Formato de imagen inválido.");
  const buf = Buffer.from(m[2], "base64");

  const tarea = (g.__ocrCola || Promise.resolve()).then(async () => {
    try {
      const worker = await obtenerWorker();
      const { data } = await worker.recognize(buf);
      return data.text || "";
    } catch (e) {
      g.__ocrWorker = undefined;
      throw e;
    }
  });
  g.__ocrCola = tarea.catch(() => {});
  return tarea;
}

/**
   Verifica que la imagen sea un comprobante válido cuyo importe coincida con `montoEsperado`
   y cuya fecha esté entre `fechasValidas` (ej. la fecha de hoy en Argentina).
 */
export async function verificarComprobanteImagen(
  imagenDataUrl: string,
  montoEsperado: number,
  fechasValidas: string[],
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
    return validarTextoComprobante(texto, montoEsperado, fechasValidas);
  } catch (e) {
    console.error("[comprobante] Error leyendo imagen con OCR:", e);
    return {
      ok: false,
      motivo: "No pude procesar la imagen del comprobante. Probá con una captura más clara.",
    };
  }
}
