const { app, BrowserWindow, Tray, Menu, nativeImage, screen, powerMonitor } = require('electron');
const fs = require('fs');
const path = require('path');
const { funcionesPendiente, repositorioPendiente, minutosRepositorio, fechaClave } = require('./horario');

const INTERVALO_CHEQUEO_MS = 15 * 1000;
const ANCHO = 380;
const ALTO = 120;
const MARGEN = 16;

let tray = null;
let ventanaActual = null;
let config = null;
let estado = null;

// ---------- Configuración ----------
// Se copia config.json a la carpeta del usuario la primera vez,
// para que se pueda editar sin reinstalar la app.

function rutaUsuario(nombre) {
  return path.join(app.getPath('userData'), nombre);
}

function esObjeto(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// Mezcla de dos niveles: lo que falte en la config del usuario se toma de fábrica.
function fusionar(base, usuario) {
  const r = { ...base };
  for (const [k, v] of Object.entries(usuario)) {
    r[k] = esObjeto(v) && esObjeto(base[k]) ? { ...base[k], ...v } : v;
  }
  return r;
}

function cargarConfig() {
  const porDefecto = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
  const ruta = rutaUsuario('config.json');
  try {
    if (!fs.existsSync(ruta)) {
      fs.mkdirSync(path.dirname(ruta), { recursive: true });
      fs.writeFileSync(ruta, JSON.stringify(porDefecto, null, 2), 'utf8');
      return porDefecto;
    }
    return fusionar(porDefecto, JSON.parse(fs.readFileSync(ruta, 'utf8')));
  } catch (err) {
    console.error('No se pudo leer config.json del usuario, uso la de fábrica:', err.message);
    return porDefecto;
  }
}

// ---------- Estado del día ----------
// Se guarda en disco para que reiniciar la PC o la app no repita mensajes
// ni reinicie la secuencia de la mañana.

function estadoNuevo() {
  return { fecha: fechaClave(new Date()), inicioRepositorio: null, mostrados: [] };
}

function cargarEstado() {
  try {
    const e = JSON.parse(fs.readFileSync(rutaUsuario('estado.json'), 'utf8'));
    return e.fecha === fechaClave(new Date()) ? e : estadoNuevo();
  } catch {
    return estadoNuevo();
  }
}

function guardarEstado() {
  try {
    fs.writeFileSync(rutaUsuario('estado.json'), JSON.stringify(estado, null, 2), 'utf8');
  } catch (err) {
    console.error('No se pudo guardar estado.json:', err.message);
  }
}

// Si cambió el día con la app abierta, se empieza de cero.
function asegurarDia() {
  if (estado.fecha !== fechaClave(new Date())) {
    estado = estadoNuevo();
    guardarEstado();
  }
}

function diaHabil(fecha = new Date()) {
  return config.dias.includes(fecha.getDay());
}

// Marca el "encendido" del día: la primera vez que la app arranca,
// despierta de suspensión o se desbloquea la sesión ese día.
function registrarEncendido() {
  asegurarDia();
  if (estado.inicioRepositorio || !diaHabil()) return;
  estado.inicioRepositorio = new Date().toISOString();
  guardarEstado();
}

// ---------- Preferencias (inicio automático) ----------

function leerPreferencias() {
  try {
    return JSON.parse(fs.readFileSync(rutaUsuario('preferencias.json'), 'utf8'));
  } catch {
    return { iniciarConSistema: true };
  }
}

function guardarPreferencias(prefs) {
  fs.writeFileSync(rutaUsuario('preferencias.json'), JSON.stringify(prefs, null, 2), 'utf8');
}

function aplicarInicioAutomatico(activo) {
  // En desarrollo no se registra, para no dejar "electron.exe" en el inicio de Windows.
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: activo });
}

// ---------- Ventana del mensaje ----------

/** @param {'funciones'|'repositorio'} tipo */
function mostrarRecordatorio(tipo = 'funciones') {
  if (ventanaActual && !ventanaActual.isDestroyed()) ventanaActual.close();

  const { workArea } = screen.getPrimaryDisplay();
  const duracionMs = config.duracionSegundos * 1000;
  const textos = config[tipo];

  const win = new BrowserWindow({
    width: ANCHO,
    height: ALTO,
    x: workArea.x + workArea.width - ANCHO - MARGEN,
    y: workArea.y + MARGEN,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  // skipTransformProcessType: evita que en Mac aparezca un icono en el Dock al mostrar el mensaje.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });

  win.loadFile(path.join(__dirname, 'recordatorio.html'), {
    query: {
      tipo,
      titulo: textos.titulo,
      mensaje: textos.mensaje,
      duracion: String(duracionMs),
    },
  });

  // showInactive: aparece sin quitarle el foco a lo que el usuario está haciendo.
  win.once('ready-to-show', () => win.showInactive());

  // Cierre: la animación de salida termina justo en duracionMs.
  const temporizador = setTimeout(() => {
    if (!win.isDestroyed()) win.close();
  }, duracionMs + 200);

  win.on('closed', () => {
    clearTimeout(temporizador);
    if (ventanaActual === win) ventanaActual = null;
  });

  ventanaActual = win;
  return win;
}

// ---------- Reloj ----------

function revisarHora() {
  asegurarDia();
  const ahora = new Date();
  const mostrados = new Set(estado.mostrados);
  const opciones = { toleranciaMinutos: config.toleranciaMinutos };

  const inicio = estado.inicioRepositorio ? new Date(estado.inicioRepositorio) : null;
  const claveRepo = repositorioPendiente(ahora, inicio, { ...config.repositorio, ...opciones }, mostrados);

  const claveFunciones = funcionesPendiente(
    ahora,
    { ...config.funciones, ...opciones, dias: config.dias },
    mostrados,
  );

  // Si coincidieran los dos, se muestra uno por chequeo; el otro sale 15 s después.
  if (claveRepo) {
    estado.mostrados.push(claveRepo);
    guardarEstado();
    mostrarRecordatorio('repositorio');
  } else if (claveFunciones) {
    estado.mostrados.push(claveFunciones);
    guardarEstado();
    mostrarRecordatorio('funciones');
  }
}

function alDespertar() {
  registrarEncendido();
  revisarHora();
}

// ---------- Icono de bandeja / barra de menú ----------

function crearIcono() {
  // Dibuja un reloj simple en memoria (no requiere archivos de imagen).
  const tam = 32;
  const buf = Buffer.alloc(tam * tam * 4);
  const esMac = process.platform === 'darwin';
  const c = (tam - 1) / 2;
  const radio = tam / 2 - 1;

  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.sqrt(dx * dx + dy * dy);
      let alfa = 0;
      let blanco = false;

      if (d <= radio) {
        alfa = Math.min(1, radio - d + 0.5);
        // Manecillas: hacia arriba y hacia la derecha.
        const enManecillaVertical = Math.abs(dx) <= 1.5 && dy <= 0 && dy >= -radio * 0.65;
        const enManecillaHorizontal = Math.abs(dy) <= 1.5 && dx >= 0 && dx <= radio * 0.5;
        const anillo = d >= radio - 3;
        if (enManecillaVertical || enManecillaHorizontal) blanco = true;
        if (esMac && !anillo && !blanco) alfa = 0; // en Mac: contorno + manecillas
      }

      const i = (y * tam + x) * 4; // BGRA
      if (esMac) {
        buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0;
        buf[i + 3] = Math.round(alfa * 255);
      } else if (blanco) {
        buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255;
        buf[i + 3] = Math.round(alfa * 255);
      } else {
        // Naranja #E8710A
        buf[i] = 0x0a; buf[i + 1] = 0x71; buf[i + 2] = 0xe8;
        buf[i + 3] = Math.round(alfa * 255);
      }
    }
  }

  const img = nativeImage.createFromBitmap(buf, { width: tam, height: tam, scaleFactor: 2 });
  if (esMac) img.setTemplateImage(true);
  return img;
}

function construirMenu() {
  const prefs = leerPreferencias();
  const minutos = minutosRepositorio(config.repositorio).join(', ');
  return Menu.buildFromTemplate([
    { label: `Repositorio: al encender (min ${minutos})`, enabled: false },
    { label: `Funciones: ${config.funciones.horarios.join(', ')}`, enabled: false },
    { type: 'separator' },
    { label: 'Probar recordatorio de repositorio', click: () => mostrarRecordatorio('repositorio') },
    { label: 'Probar recordatorio de funciones', click: () => mostrarRecordatorio('funciones') },
    { type: 'separator' },
    {
      label: 'Iniciar con el sistema',
      type: 'checkbox',
      checked: prefs.iniciarConSistema,
      enabled: app.isPackaged,
      click: (item) => {
        guardarPreferencias({ ...prefs, iniciarConSistema: item.checked });
        aplicarInicioAutomatico(item.checked);
        tray.setContextMenu(construirMenu());
      },
    },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() },
  ]);
}

// ---------- Arranque ----------

if (!app.requestSingleInstanceLock()) {
  // Ya hay una copia corriendo: esta se cierra para no duplicar mensajes.
  app.quit();
} else {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();

  app.whenReady().then(() => {
    config = cargarConfig();
    estado = cargarEstado();

    aplicarInicioAutomatico(leerPreferencias().iniciarConSistema);

    tray = new Tray(crearIcono());
    tray.setToolTip('Recordatorio ERP');
    tray.setContextMenu(construirMenu());

    registrarEncendido();
    revisarHora();
    setInterval(revisarHora, INTERVALO_CHEQUEO_MS);

    // Laptops que no se apagan: el "encendido" es al despertar o desbloquear.
    powerMonitor.on('resume', alDespertar);
    powerMonitor.on('unlock-screen', alDespertar);

    if (process.argv.includes('--probar')) mostrarRecordatorio('funciones');
    if (process.argv.includes('--probar-repo')) mostrarRecordatorio('repositorio');
  });

  // La app vive en la bandeja: cerrar la ventanita no debe cerrar la app.
  app.on('window-all-closed', () => {});
}

module.exports = { mostrarRecordatorio };
