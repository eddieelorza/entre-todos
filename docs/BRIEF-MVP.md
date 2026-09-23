# Entre Todos — Brief del MVP

*23 de septiembre de 2026 · [entre-todos](https://github.com/eddieelorza/entre-todos) · HTML/CSS/JS vanilla, sin backend, sin IA en runtime*

## El problema

Toda comunidad tiene muchísima capacidad ociosa —una hielera, alguien que sabe de bicis, alguien que trabaja desde casa los jueves— pero está invisible. Para usarla hoy hay que saber exactamente qué pedir, a quién y dónde: se acaba comprando algo que se usará una vez, o publicando en un grupo y esperando.

## La solución

Escribes una situación con tus palabras:

> "Voy a hacer una carne asada para 12 personas el sábado."

Entre Todos entiende qué hace falta (lo dicho y lo no dicho), descubre qué personas, objetos, lugares y trayectos ya existen cerca, y arma una solución con varias personas a la vez:

> **No necesitas comprar casi nada. Tu comunidad ya tiene 7 de las 8 cosas que necesitas.**

No es un marketplace ni un feed ni un chatbot. Es una interfaz entre una persona y la capacidad colectiva de su comunidad, y cada ayuda que sale bien se convierte en una relación de confianza.

## Cómo funciona (en una frase por capa)

- **Resolver** (`js/resolver.js`): Situación → entender → necesidades → capacidades → solución → mensaje, todo con reglas; las dos primeras etapas devuelven objetos planos, listas para que un modelo las sustituya sin tocar el resto.
- **Community Simulation Layer** (`js/communities/*.js`): tres comunidades con estructura social propia (Jacarandas/CDMX, Los Pinos/Guadalajara, Gràcia/Barcelona); la misma frase produce necesidades y personas distintas en cada una.
- **Trust Graph** (`js/trust.js`): confianza progresiva por interacciones reales, círculos explícitos y emergentes, confianza indirecta ("Conectada a través de Mariana"). Nunca estrellas ni puntajes.
- **Place Capabilities** (`js/places.js`): el edificio también ayuda (recepción 24 h, bicicletero, salón común, elevador de carga), combinado con personas y objetos en la misma solución.
- **Visual Confirm**: una foto para confirmar el objeto correcto antes de coordinar, nunca reconocimiento de imagen.

## Lo nuevo: un mundo que se explora, no una app con pantallas

Desde esta semana, `js/world/` reemplaza el corte entre mapa, edificio y constelación por una sola escena 3D y una sola cámara (Three.js, geometría procedural, sin assets pesados). Cada transformación representa un concepto real: la geografía es proximidad, un edificio en cristal muestra las capacidades del lugar, la distancia entre dos personas es confianza, y una necesidad crea gravedad que atrae a quien puede ayudar. El MVP HTML clásico queda como fallback (sin WebGL o sin plano) y como capa de accesibilidad. Detalle completo en [`MUNDO-3D.md`](MUNDO-3D.md); capturas en [`portfolio/`](portfolio/README.md).

## Prueba y evidencia

- `node scripts/test-resolver.mjs` → **17/17 historias · 54/54 comprobaciones** del pipeline situación→solución, sin navegador.
- `node scripts/test-world.mjs` → **20/20 comprobaciones** del modelo espacial (distancia = confianza, gravedad, el lugar en la solución, cercanía tras ayudar).
- Nueve historias de demo reproducibles con un chip ("Recibir un paquete", "Carne asada para 12", "Bici rota"…), la misma frase en tres comunidades, y modo sencillo con voz para accesibilidad.

## Estado y límites (honesto)

MVP de demostración: comunidades y personas ficticias, nadie responde de verdad (aceptación simulada a los pocos segundos), sin backend ni autenticación. La "inteligencia" son reglas; el siguiente paso técnico obvio es sustituir `understandSituation`/`discoverNeeds` por una llamada a un modelo que devuelva la misma forma de datos —el resto del pipeline, la UI y las pruebas no cambian.

## Diferenciación

| Entre Todos | No es |
| --- | --- |
| Situación → solución armada entre varias personas | Post → feed → comentarios |
| Confianza por comportamiento, frases humanas | Estrellas, puntos, rankings |
| El lugar también ayuda (Place Capabilities) | Solo un directorio de vecinos |
| Inteligencia invisible: "Encontramos una forma" | Un chatbot o algo "AI-powered" |

## Próximo paso

Producto: el lado de quien ayuda (recibir peticiones reales) y el canal de coordinación. Técnico: modelo real para las dos primeras etapas del resolver, y conectar el mundo 3D a las conexiones reales (Visual Confirm y "ayuda completada" con datos de `State`, no simulados).

---
Ver también: [`README.md`](../README.md) (recorrido completo del producto) · [`ANALISIS-DEL-SISTEMA.md`](ANALISIS-DEL-SISTEMA.md) (pitch de 60 s y detalle de arquitectura) · [`MUNDO-3D.md`](MUNDO-3D.md) (el mundo 3D).
