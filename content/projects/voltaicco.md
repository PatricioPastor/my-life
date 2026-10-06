---
slug: voltaicco
title: Voltaicco
updated: 2026-10-06
role: Diseño y desarrollo
period: "2026"
summary: Una consola para vigilar una flota de estaciones de energía portátiles que trabajan como UPS.
stack:
  - Next.js 16
  - React 19
  - TypeScript
  - Tailwind CSS 4
  - Prisma 7
  - Neon Postgres
  - Better Auth
  - Zod 4
  - Vitest
  - Testing Library
  - GitHub Actions
  - Vercel
order: 1
---

<!--
  FORMATO DE ESTE ARCHIVO (se valida al compilar: si algo no está permitido, el build falla y dice en qué línea)

  Arriba, entre las dos líneas de guiones, van los campos. Todos son obligatorios:
    slug:     el nombre del proyecto en la dirección, en minúsculas y con guiones entre palabras (voltaicco)
    title:    el nombre del proyecto
    updated:  la fecha de la última edición, como AAAA-MM-DD
    role:     qué hice, en pocas palabras (se muestra junto al período)
    period:   cuándo, como se lee ("2026", "2024–2026")
    summary:  una oración sobre el proyecto
    stack:    las herramientas principales, una por línea, con un guion delante
    order:    el lugar en la lista de Proyectos (1 va primero)

  Abajo va el texto, con las mismas reglas que la historia de la intro: párrafos, *énfasis*, **fuerte**,
  > una cita y ## un subtítulo. Una línea con tres guiones (---) da vuelta la página.
  En el texto no se permite: listas, enlaces, imágenes, código, tablas, HTML, tachado ni otros títulos.
  Este comentario no se muestra en el sitio.
-->

Voltaicco es una consola para vigilar una flota de estaciones de energía portátiles EcoFlow que trabajan como UPS. La usan los operadores de la mesa de ayuda de una empresa con un centro de soporte: siguen cientos de equipos a la vez y escalan cuando la batería baja al 80, al 50 y al 20 %.

Lo diseñé y lo construí de punta a punta, solo, entre septiembre y octubre de 2026. Hoy es un MVP en una prueba piloto.

---

## Cómo está hecho

El código está organizado por módulos de negocio, y cada uno separa dominio, aplicación e infraestructura con puertos y adaptadores. Las reglas de importación son estrictas: el dominio no conoce React, Next, Zod ni el código del proveedor.

La telemetría se lee en el servidor, desde la API para desarrolladores de EcoFlow, con pedidos firmados con HMAC-SHA256: las credenciales nunca llegan al navegador. La URL de cada equipo es opaca, un HMAC de su número de serie, que así nunca aparece en una dirección.

---

## Apagar a distancia

Encender o apagar a distancia las salidas de corriente alterna de un equipo es la parte delicada, así que el control falla cerrado. Hay un interruptor que lo desactiva todo y una lista de equipos habilitados; cada intento se escribe en una tabla de auditoría antes de enviarse, hay una espera entre intentos y el resultado se confirma leyendo otra vez el estado de la salida.

El acceso es por roles: Administrador, Operador y Lector. Se ingresa con Google, solo con cuentas de la empresa.

---

## Pruebas, accesibilidad y costo

Trabajé con las pruebas primero. La integración continua exige un 80 % de cobertura; hoy son unas 1400 pruebas, con cerca del 94 % de las líneas cubiertas. El objetivo de accesibilidad es WCAG 2.2 AA, y el modo oscuro está a la par del claro.

Los datos se sincronizan una vez por hora, a propósito: así la base de datos puede escalar a cero entre una sincronización y la siguiente. El costo también fue parte del diseño.
