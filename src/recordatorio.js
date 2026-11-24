// Corre dentro de la ventanita del mensaje (sin acceso a Node).
(function () {
  const params = new URLSearchParams(location.search);
  const duracion = Number(params.get('duracion')) || 4000;
  const DURACION_SALIDA = 300;

  if (params.get('tipo') === 'repositorio') document.body.classList.add('repositorio');

  document.getElementById('titulo').textContent = params.get('titulo') || 'Recordatorio';
  document.getElementById('mensaje').textContent = params.get('mensaje') || '';

  const toast = document.getElementById('toast');
  const progreso = document.getElementById('progreso');

  toast.classList.add('entrar');
  progreso.style.animationDuration = duracion - DURACION_SALIDA + 'ms';
  progreso.classList.add('corriendo');

  function salir() {
    toast.classList.remove('entrar');
    toast.classList.add('salir');
  }

  setTimeout(salir, duracion - DURACION_SALIDA);
  // Clic para cerrarlo antes de tiempo.
  toast.addEventListener('click', salir);
})();
