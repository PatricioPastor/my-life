---
slug: voltaicco
title: Voltaicco
updated: 2026-10-07
role: Proyecto IoT · diseño y desarrollo
period: "2026"
summary: Monitor de UPS para electrodependientes.
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
logo: /projects/voltaicco/logo.svg
mark: /projects/voltaicco/mark.svg
---

<!--
  FORMATO DE ESTE ARCHIVO (se valida al compilar: si algo no está permitido, el build falla y dice en qué línea)

  Arriba, entre las dos líneas de guiones, van los campos. Todos son obligatorios:
    slug:     el nombre del proyecto en la dirección, en minúsculas y con guiones entre palabras (voltaicco)
    title:    el nombre del proyecto
    updated:  la fecha de la última edición, como AAAA-MM-DD
    role:     qué clase de proyecto es y qué hice, en pocas palabras (se muestra junto al período)
    period:   cuándo, como se lee ("2026", "2024–2026")
    summary:  una oración sobre el proyecto
    stack:    las herramientas principales, una por línea, con un guion delante
    order:    el lugar en la lista de Proyectos (1 va primero)

  Estos dos son opcionales; sin ellos, el nombre se muestra como texto:
    logo:     el logo completo, en lugar del título del caso (una ruta a un SVG dentro de public/projects)
    mark:     solo el símbolo, junto al nombre en la lista de Proyectos (también un SVG dentro de public/projects)

  Abajo va el texto, con las mismas reglas que la historia de la intro: párrafos, *énfasis*, **fuerte**,
  > una cita y ## un subtítulo. Una línea con tres guiones (---) da vuelta la página.
  En el texto no se permite: listas, enlaces, imágenes, código, tablas, HTML, tachado ni otros títulos.
  Este comentario no se muestra en el sitio.
-->

Voltaicco es un monitor de UPS para personas electrodependientes, las que viven conectadas en su casa a un equipo médico eléctrico. Es un proyecto IoT que diseñé y construí de punta a punta, solo, en 2026.

---

## El problema

En cada casa, una estación de energía portátil trabaja como UPS: carga mientras hay red y sostiene el equipo médico cuando se corta. El riesgo es que la batería se agote sin que nadie lo note.

Los operadores de un centro de atención siguen muchos equipos a la vez y escalan por niveles: un primer contacto cuando un equipo en batería baja al 80 %, un segundo al 50 %, y el nivel crítico al 20 %, por debajo del cual deja de alimentar sus tomas. Voltaicco es la consola donde hacen ese trabajo. Cada alerta dice qué hacer, no solo qué lectura la disparó, y un equipo que no reporta muestra *sin datos* en lugar de adivinar.

---

## La integración IoT

Los equipos se leen desde la plataforma abierta IoT de EcoFlow, siempre en el servidor. Cada pedido va firmado con HMAC-SHA256 y la clave secreta nunca llega al navegador. Toda respuesta se valida con Zod en el borde y se convierte en un tipo del dominio: nada crudo del proveedor llega a la interfaz.

La plataforma acepta órdenes por REST o por MQTT. Elegí REST porque la aplicación corre en funciones que viven lo que dura un pedido, y MQTT pide una conexión que quede abierta. En las direcciones, un equipo aparece con un identificador opaco, nunca con su número de serie.

---

## Arquitectura

Las carpetas dicen lo que hace el negocio, al estilo de *Screaming Architecture*: equipos, telemetría, controles. Cada módulo separa dominio, aplicación e infraestructura con puertos y adaptadores, y un archivo de composición los conecta y es su única puerta hacia afuera.

Las reglas de importación son estrictas. El dominio no conoce React, Next.js, Zod ni al proveedor; un módulo nunca entra en otro, y un componente de cliente nunca toca la infraestructura. Se lee en Server Components y se escribe solo en Server Actions, que validan la entrada y revisan sesión y permiso en su propio cuerpo. Hasta el cliente de la plataforma está partido en dos: los adaptadores de lectura reciben uno que solo sabe leer, y ESLint impide importar el que escribe fuera del módulo de controles.

---

## Apagar a distancia

Encender o apagar a distancia las salidas de un equipo es la parte delicada: apagarlas corta la energía de lo que esté conectado. Por eso el control falla cerrado. Un interruptor general lo desactiva todo, y un valor mal escrito cuenta como apagado; una lista de equipos habilitados deja afuera a cualquier otro.

Cada intento se escribe en una tabla de auditoría antes de enviarse, y un equipo recibe a lo sumo una orden cada diez segundos. Que la plataforma acepte la orden no prueba que el equipo la aplicó, así que el resultado se confirma leyendo otra vez el estado de la salida.

---

## Acceso y roles

Se ingresa con Google, solo con cuentas de la organización, y el servidor las verifica en cada ingreso. Hay tres roles, Administrador, Operador y Lector; el código revisa permisos, nunca nombres de rol, y siempre queda al menos un administrador.

---

## Calidad, accesibilidad y costo

Trabajé con las pruebas primero, con Vitest y Testing Library, un umbral de cobertura del 80 % y una integración continua que revisa cada cambio. El objetivo de accesibilidad es WCAG 2.2 AA: un estado nunca se comunica solo con color, y el modo oscuro está a la par del claro.

El costo también fue parte del diseño. La sincronización está pensada para correr una vez por hora, a propósito, así la base de datos puede escalar a cero entre una y otra.

---

## Dónde está hoy

Voltaicco es un MVP en un piloto. La lista de equipos, el detalle, el ingreso y los roles funcionan. El control de las salidas está construido, pero apagado hasta confirmarlo en una prueba controlada.
