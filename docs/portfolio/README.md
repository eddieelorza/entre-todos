# Capturas y GIFs para el portafolio

Generadas el 17 de septiembre de 2026 contra el servidor local, sin retoques. Móvil a 390×844 (2×), escritorio a 1200×800. Ver el análisis completo en [`../ANALISIS-DEL-SISTEMA.md`](../ANALISIS-DEL-SISTEMA.md).

## GIFs (el flujo funcionando)

| Archivo | Duración aprox. | Qué muestra |
| --- | --- | --- |
| `flujo-carne-asada.gif` | 30 s | Inicio → chip "Carne asada para 12" → "Entendiendo…" → necesidades → "7 de las 8 cosas" → revisar mensajes por persona → seis respuestas → resuelto → sugerencia de círculo de confianza |
| `tres-comunidades.gif` | 40 s | La misma frase escrita en Jacarandas, Los Pinos y Gràcia; cambio de comunidad incluido |
| `paquete.gif` | 15 s | "Mariana puede resolverlo desde tu mismo edificio" y la razón: su disponibilidad, no un anuncio |
| `bici-estrategias.gif` | 12 s | "Hay 3 formas de resolverlo. Ninguna implica comprar nada." y elegir una |
| `ikea-oportunidad.gif` | 10 s | "Puedes ayudar a 2 vecinos con un viaje que ya vas a hacer" → avisar a Ana |
| `mama-circulo-de-confianza.gif` | 12 s | Cita médica: "Gente en la que ya confías" y alcance por defecto "Mi círculo de confianza" |
| `constelacion.gif` | 11 s | Community Constellation organizándose alrededor de la carne asada (escritorio) |

## Pantallas

| Archivo | Pantalla |
| --- | --- |
| `01-inicio.png` · `01-inicio-completo.png` · `01-inicio-desktop.png` | Inicio en Jacarandas (móvil, página completa, escritorio) |
| `01-inicio-los-pinos.png` · `01-inicio-gracia.png` | Inicio en las otras dos comunidades: ejemplos y "Tu comunidad hoy" cambian solos |
| `02-situacion-carne-asada.png` | Página completa de la solución: entendimos, necesidades editables, seis personas con su porqué, el hueco honesto |
| `03-autorizacion-por-persona.png` | Diálogo de revisión: un mensaje editable por persona y "¿Quién puede ver esto?" |
| `04-esperando-respuestas.png` · `05-todos-dijeron-que-si.png` | Progreso de las peticiones |
| `06-resuelto-entre-todos.png` | "Resuelto entre todos", lo que la comunidad aprendió y la sugerencia de círculo |
| `07-cambiar-comunidad.png` | Selector de comunidad |
| `07a-comida-jacarandas.png` · `07b-comida-los-pinos.png` · `07c-comida-gracia.png` | Misma frase, tres soluciones distintas |
| `08-paquete-mariana.png` | Disponibilidad inferida |
| `09-noche-mexicana-en.png` | Flujo en inglés con solución de tres personas y el extra de Wei (mandarín) |
| `10-perfil.png` | "Lo que tu comunidad sabe de ti", señales de confianza, tu red |
| `11-mis-situaciones.png` | En curso y resueltas |
| `12-bici-tres-estrategias.png` | Estrategias alternativas |
| `13-ikea-oportunidad.png` | Oportunidad |
| `14-mama-confianza.png` · `15-alcance-mi-circulo.png` | Contexto sensible y alcance |
| `16-constelacion.png` · `16-constelacion-mobile.png` | Community Constellation |
| `17-mapa.png` | Mapa ilustrado de la comunidad |
| `18-modo-sencillo.png` | Modo sencillo |

## Regenerar

Las capturas se hicieron con un script de Playwright (Chromium headless) que recorre el flujo real y codifica los GIFs con `gifenc`. Requiere `npm i playwright gifenc pngjs && npx playwright install chromium` en una carpeta aparte y el servidor local corriendo.
