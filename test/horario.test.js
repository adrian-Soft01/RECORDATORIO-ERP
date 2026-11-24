const assert = require('assert');
const { funcionesPendiente, repositorioPendiente, minutosRepositorio } = require('../src/horario');

let ok = 0;
function prueba(nombre, real, esperado) {
  assert.deepStrictEqual(real, esperado, nombre);
  ok++;
}

// 2026-11-24 es martes.
const a = (hh, mm, dia = 24, ss = 30) => new Date(2026, 10, dia, hh, mm, ss);

// ---------- Funciones (tarde) ----------

const funciones = {
  horarios: ['17:10', '17:20', '17:30', '17:40'],
  dias: [1, 2, 3, 4, 5],
  toleranciaMinutos: 2,
};

const casosFunciones = [
  ['antes de la primera', a(17, 9), null],
  ['justo 17:10', a(17, 10), '2026-11-24 17:10'],
  ['17:11 dentro de tolerancia', a(17, 11), '2026-11-24 17:10'],
  ['17:12 fuera de tolerancia', a(17, 12), null],
  ['17:20', a(17, 20), '2026-11-24 17:20'],
  ['17:30', a(17, 30), '2026-11-24 17:30'],
  ['17:40', a(17, 40), '2026-11-24 17:40'],
  ['17:41', a(17, 41), '2026-11-24 17:40'],
  ['17:42 ya terminó', a(17, 42), null],
  ['5:10 de la mañana no', a(5, 10), null],
  ['sábado no', a(17, 10, 28), null],
  ['domingo no', a(17, 10, 29), null],
];
for (const [nombre, fecha, esperado] of casosFunciones) {
  prueba(nombre, funcionesPendiente(fecha, funciones, new Set()), esperado);
}

prueba('no repetir 17:10', funcionesPendiente(a(17, 11), funciones, new Set(['2026-11-24 17:10'])), null);
prueba('al día siguiente sí', funcionesPendiente(a(17, 10, 25), funciones, new Set(['2026-11-24 17:10'])), '2026-11-25 17:10');

// ---------- Repositorio (mañana) ----------

const repo = { cadaMinutos: 8, duranteMinutos: 25, toleranciaMinutos: 2 };
prueba('minutos: 0, 8, 16, 24', minutosRepositorio(repo), [0, 8, 16, 24]);

const encendido = a(8, 3, 24, 0); // prende la PC a las 8:03
const mas = (min) => new Date(encendido.getTime() + min * 60000);

const casosRepo = [
  ['al encender', mas(0), '2026-11-24 repo+0'],
  ['minuto 1', mas(1), '2026-11-24 repo+0'],
  ['minuto 3 nada', mas(3), null],
  ['minuto 8', mas(8), '2026-11-24 repo+8'],
  ['minuto 16', mas(16), '2026-11-24 repo+16'],
  ['minuto 24', mas(24), '2026-11-24 repo+24'],
  ['minuto 25.9 aún el de 24', mas(25.9), '2026-11-24 repo+24'],
  ['minuto 26 terminó', mas(26), null],
  ['minuto 32 no hay más', mas(32), null],
];
for (const [nombre, fecha, esperado] of casosRepo) {
  prueba(nombre, repositorioPendiente(fecha, encendido, repo, new Set()), esperado);
}

prueba('sin encendido registrado', repositorioPendiente(mas(0), null, repo, new Set()), null);
prueba('no repetir repo+8', repositorioPendiente(mas(9), encendido, repo, new Set(['2026-11-24 repo+8'])), null);

// Secuencia completa revisando cada 15 s durante 40 min: debe mostrar exactamente 4.
const mostrados = new Set();
for (let s = 0; s <= 40 * 60; s += 15) {
  const clave = repositorioPendiente(new Date(encendido.getTime() + s * 1000), encendido, repo, mostrados);
  if (clave) mostrados.add(clave);
}
prueba('secuencia completa: 4 mensajes', [...mostrados], [
  '2026-11-24 repo+0', '2026-11-24 repo+8', '2026-11-24 repo+16', '2026-11-24 repo+24',
]);

console.log(`OK: ${ok} pruebas pasaron`);
