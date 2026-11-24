// Lógica pura de horarios: sin Electron, para poder probarla con Node.

function aMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fechaClave(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Recordatorio de funciones (tarde): horarios fijos del reloj.
 * Devuelve la clave a marcar ("YYYY-MM-DD HH:MM") si toca mostrarlo ahora, o null.
 * Toca si la hora actual está entre el horario y horario + toleranciaMinutos,
 * el día está habilitado y no se mostró hoy.
 *
 * @param {Date} ahora
 * @param {{horarios: string[], dias: number[], toleranciaMinutos: number}} config
 * @param {Set<string>} mostrados
 */
function funcionesPendiente(ahora, config, mostrados) {
  if (!config.dias.includes(ahora.getDay())) return null;

  const minutoActual = ahora.getHours() * 60 + ahora.getMinutes();
  const hoy = fechaClave(ahora);

  for (const horario of config.horarios) {
    const inicio = aMinutos(horario);
    const dentro = minutoActual >= inicio && minutoActual < inicio + config.toleranciaMinutos;
    const clave = `${hoy} ${horario}`;
    if (dentro && !mostrados.has(clave)) return clave;
  }
  return null;
}

/** Minutos después del encendido en que toca el recordatorio: 0, 8, 16, 24... */
function minutosRepositorio(config) {
  const lista = [];
  for (let m = 0; m <= config.duranteMinutos; m += config.cadaMinutos) lista.push(m);
  return lista;
}

/**
 * Recordatorio de repositorio (mañana): relativo a la hora en que se encendió
 * la máquina ese día. Devuelve la clave a marcar ("YYYY-MM-DD repo+N") o null.
 *
 * @param {Date} ahora
 * @param {Date|null} inicio  primer encendido/desbloqueo del día
 * @param {{cadaMinutos: number, duranteMinutos: number, toleranciaMinutos: number}} config
 * @param {Set<string>} mostrados
 */
function repositorioPendiente(ahora, inicio, config, mostrados) {
  if (!inicio) return null;
  const transcurridos = (ahora - inicio) / 60000;
  const dia = fechaClave(inicio);

  for (const minuto of minutosRepositorio(config)) {
    const dentro = transcurridos >= minuto && transcurridos < minuto + config.toleranciaMinutos;
    const clave = `${dia} repo+${minuto}`;
    if (dentro && !mostrados.has(clave)) return clave;
  }
  return null;
}

module.exports = {
  funcionesPendiente,
  repositorioPendiente,
  minutosRepositorio,
  fechaClave,
  aMinutos,
};
