import Link from "next/link";

export default function Inicio() {
  return (
    <div className="centrado">
      <div className="tarjeta">
        <span className="logo-web">w<i>&rsquo;</i>ebi</span>
        <h1>Asistente de turnos</h1>
        <p>Tu local saca turnos solo: el cliente escanea un QR, chatea y reserva. Vos ves todo en tu agenda.</p>
        <Link className="btn pri" href="/registro" style={{ textAlign: "center" }}>Dar de alta mi local</Link>
        <Link className="btn" href="/login" style={{ textAlign: "center" }}>Ya tengo local: entrar</Link>
        <p style={{ fontSize: ".82rem" }}>¿Querés ver cómo lo ve un cliente? <Link className="enlace" href="/t/barberia-el-faro">Probá la barbería de ejemplo</Link>.</p>
      </div>
    </div>
  );
}
