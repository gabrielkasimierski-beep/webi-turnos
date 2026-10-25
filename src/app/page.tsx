import Link from "next/link";

export default function Inicio() {
  return (
    <div className="centrado">
      <div className="tarjeta">
        <span className="logo-web">w<i>&rsquo;</i>ebi</span>
        <h1>Asistente de turnos</h1>
        <p>Tu local saca turnos solo: el cliente entra a tu link o escanea el QR, chatea con tu asistente y reserva. Vos recibís el aviso en el celular y ves todo en tu agenda.</p>
        <Link className="btn pri" href="/login" style={{ textAlign: "center" }}>Entrar a mi panel</Link>
        <p style={{ fontSize: ".82rem" }}>¿Querés ver cómo lo ve un cliente? <Link className="enlace" href="/t/barberia-el-faro">Probá la barbería de ejemplo</Link>.</p>
      </div>
    </div>
  );
}
