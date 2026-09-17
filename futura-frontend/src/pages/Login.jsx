import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Login.module.css";
import { RUTAS, CARGO_LABELS } from "../utils/rutas";
import { cargosDeUsuario } from "../utils/roles";

const logo = "/assets/logo-futura.png";

const API = "/api";

export default function Login() {
  const navigate = useNavigate();

  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [errorKey, setErrorKey] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [welcome, setWelcome] = useState(null);
  const [seleccionCargo, setSeleccionCargo] = useState(null);

  const [recordar, setRecordar] = useState(false);

  const passRef = useRef(null);
  const userRef = useRef(null);

  /* ===== LIMPIEZA DE ESTILOS GLOBALES DE BODY ===== */
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    document.body.style.overflow = "hidden";
    document.body.style.background = "#f2f2f7";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBg;
    };
  }, []);

  /* ===== PARTICULAS (14, valores aleatorios fijos por montaje) ===== */
  const particulas = useMemo(() =>
    Array.from({ length: 14 }, () => {
      const size = Math.random() * 5 + 3;
      return {
        left: Math.random() * 100 + "vw",
        width: size + "px",
        height: size + "px",
        opacity: Math.random() * 0.5 + 0.2,
        animationDuration: Math.random() * 10 + 8 + "s",
        animationDelay: Math.random() * 8 + "s",
      };
    }), []);

  /* ===== SALUDO DINÁMICO ===== */
  const valUpper = usuario.trim().toUpperCase();
  const femenino = valUpper.endsWith("A");
  const saludoTxt = femenino ? "Bienvenida a FUTURA" : "Bienvenido a FUTURA";
  const nombreTxt = usuario.trim().length < 2 ? "..." : valUpper;

  /* ===== Si ya hay sesión activa → redirigir ===== */
  useEffect(() => {
    try {
      const token = sessionStorage.getItem("nc_token");
      const raw = sessionStorage.getItem("nc_usuario");
      if (token && raw) {
        const u = JSON.parse(raw);
        const ruta = RUTAS[u.cargo];
        if (ruta) navigate(ruta, { replace: true });
      }
    } catch (e) { /* noop */ }

    // Solo recuerda el nombre de usuario tecleado (conveniencia de UI),
    // nunca la sesión/token — eso sigue viviendo únicamente en sessionStorage.
    try {
      const recordado = localStorage.getItem("nc_remember_user");
      if (recordado) {
        setUsuario(recordado);
        setRecordar(true);
      }
    } catch (e) { /* noop */ }

    userRef.current?.focus();
  }, [navigate]);

  const mostrarError = (msg) => {
    setError(msg);
    setErrorKey((k) => k + 1);
  };

  /* ===== ANIMACIÓN DE BIENVENIDA ===== */
  const mostrarBienvenida = (user) => {
    const primerNombre = user.nombre.split(" ")[0];
    const fem = primerNombre.toUpperCase().endsWith("A");
    setWelcome({ primerNombre, femenino: fem, cargo: CARGO_LABELS[user.cargo] || user.cargo });

    const ruta = RUTAS[user.cargo] || "/dashboard";
    navigate(ruta, { replace: true });
  };

  const completarLogin = (data) => {
    sessionStorage.setItem("nc_token", data.token);
    sessionStorage.setItem("nc_usuario", JSON.stringify(data.usuario));
    localStorage.removeItem("nc_token");
    localStorage.removeItem("nc_usuario");

    // Cargos reales del usuario (principal + adicionales) que además tienen
    // ruta navegable. Con más de uno, el usuario elige con cuál entrar —
    // sin volver a autenticar, es la misma sesión/token ya guardada arriba.
    const cargosReales = cargosDeUsuario(data.usuario).filter((c) => RUTAS[c]);
    if (cargosReales.length > 1) {
      setSeleccionCargo({ cargos: cargosReales, usuario: data.usuario });
      setCargando(false);
      return;
    }

    setSeleccionCargo(null);
    mostrarBienvenida(data.usuario);
  };

  const elegirArea = (cargo) => {
    if (!seleccionCargo) return;
    setSeleccionCargo(null);
    mostrarBienvenida({ ...seleccionCargo.usuario, cargo });
  };

  const cancelarSeleccion = () => {
    sessionStorage.removeItem("nc_token");
    sessionStorage.removeItem("nc_usuario");
    setSeleccionCargo(null);
    setError("");
    setUsuario("");
    setPassword("");
  };

  /* ===== LOGIN ===== */
  const autenticar = async () => {
    setError("");

    const u = usuario.trim().toLowerCase();
    const p = password;

    if (!u) { mostrarError("Ingresa tu usuario."); return; }
    if (!p) { mostrarError("Ingresa tu contraseña."); return; }

    try {
      if (recordar) localStorage.setItem("nc_remember_user", u);
      else localStorage.removeItem("nc_remember_user");
    } catch (e) { /* noop */ }

    setCargando(true);
    try {
      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: u, password: p }),
      });
      const data = await res.json();

      if (!data.ok) {
        mostrarError(data.mensaje || "Usuario o contraseña incorrectos.");
        setCargando(false);
        return;
      }

      completarLogin(data);
    } catch (err) {
      console.error("Error de conexión:", err);
      mostrarError("No se pudo conectar al servidor. ¿Está corriendo el backend?");
      setCargando(false);
    }
  };

  const doLogin = async (e) => {
    if (e) e.preventDefault();
    await autenticar();
  };

  /* ===== PANTALLA DE TRANSICIÓN (blanca) ===== */
  if (welcome) {
    return (
      <div className={styles.transition}>
        <div className={styles.transLogo}>
          <img src={logo} alt="NC" />
        </div>
        <div className={styles.transGreet}>
          {welcome.femenino ? "¡Bienvenida de nuevo," : "¡Bienvenido de nuevo,"}
        </div>
        <div className={styles.transName}>
          {welcome.primerNombre.split("").map((c, i) =>
            i === 0 ? <span key={i} className={styles.transAccent}>{c}</span> : <span key={i}>{c}</span>
          )}
        </div>
        <div className={styles.transCargo}>{welcome.cargo}</div>
        <div className={styles.transLabel}>
          CARGANDO TU PANEL
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </div>
      </div>
    );
  }

  /* ===== LOGIN NORMAL (layout split: panel de marca + panel de acceso) ===== */
  return (
    <div className={styles.page}>
      <div className={styles.leftPanel}>
        <div className={styles.leftGrid} />
        <div className={styles.leftGlow} />

        <div className={styles.brandBlock}>
          <div className={styles.brandLogoRow}>
            <img src={logo} alt="FUTURA" className={styles.brandLogo} />
            <span className={styles.brandName}>FUTURA</span>
          </div>
          <p className={styles.brandTagline}>Gestión comercial con control total.</p>

          <div className={styles.featureRow}>
            <div className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18" />
                  <path d="m19 9-5 5-4-4-3 3" />
                </svg>
              </span>
              <span>Ventas</span>
            </div>
            <div className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </span>
              <span>Seguimiento</span>
            </div>
            <div className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </span>
              <span>Grabaciones</span>
            </div>
            <div className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18" />
                  <rect x="7" y="13" width="3" height="5" />
                  <rect x="12" y="9" width="3" height="9" />
                  <rect x="17" y="6" width="3" height="12" />
                </svg>
              </span>
              <span>Reportes</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.rightPanel}>
        <div className={styles.particles}>
          {particulas.map((p, i) => <span key={i} style={p} />)}
        </div>

        <div className={styles.formCard}>
          {seleccionCargo ? (
            <>
              <h2 className={styles.saludo}>Selecciona el área de trabajo</h2>
              <p className={styles.roleSubtitle}>
                {seleccionCargo.usuario?.nombre || usuario}, tienes más de un área asignada.
              </p>

              {error && <div key={errorKey} className={styles.errorMsg}>{error}</div>}

              <div className={styles.roleList}>
                {seleccionCargo.cargos.map((cargo) => (
                  <button
                    type="button"
                    key={cargo}
                    className={styles.roleButton}
                    onClick={() => elegirArea(cargo)}
                  >
                    <span className={styles.roleIcon}>{(CARGO_LABELS[cargo] || cargo).slice(0, 1)}</span>
                    <span>
                      <strong>{CARGO_LABELS[cargo] || cargo}</strong>
                      <small>Abrir este módulo</small>
                    </span>
                    <b>→</b>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className={styles.backButton}
                onClick={cancelarSeleccion}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <h2 className={styles.saludo}>
                Bienvenido a <strong>FUTURA</strong>
              </h2>
              <p className={styles.formSubtitle}>Ingrese sus credenciales para continuar.</p>
              {usuario.trim().length >= 2 && (
                <p className={styles.nombreUsuario}>{nombreTxt}</p>
              )}

              {error && (
                <div key={errorKey} className={styles.errorMsg}>{error}</div>
              )}

              <form onSubmit={doLogin} autoComplete="off">
                <div className={styles.inputGroup}>
                  <label>Nombre de usuario</label>
                  <input
                    ref={userRef}
                    type="text"
                    placeholder="Ingrese su nombre de usuario"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); passRef.current?.focus(); } }}
                    className={error ? styles.error : ""}
                    autoComplete="off"
                    required
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label>Contraseña</label>
                  <div className={styles.passWrap}>
                    <input
                      ref={passRef}
                      type={showPassword ? "text" : "password"}
                      placeholder="Ingrese su contraseña"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={error ? styles.error : ""}
                      autoComplete="new-password"
                      required
                    />
                    <span
                      className={styles.eye}
                      onClick={() => setShowPassword((v) => !v)}
                      title="Mostrar/ocultar"
                    >
                      {showPassword ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                          <line x1="2" x2="22" y1="2" y2="22" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </span>
                  </div>
                </div>

                <label className={styles.rememberRow}>
                  <input
                    type="checkbox"
                    checked={recordar}
                    onChange={(e) => setRecordar(e.target.checked)}
                  />
                  Recordar usuario
                </label>

                <button type="submit" className={styles.submitBtn} disabled={cargando}>
                  {cargando ? "Verificando..." : "Iniciar sesión"}
                </button>
              </form>

              <div className={styles.formFooter}>
                <p>Acceso solo para usuarios autorizados.</p>
                <p>© {new Date().getFullYear()} FUTURA · Plataforma de Gestión Empresarial</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
