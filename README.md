# Mapa de lotes · Parque Industrial General Manuel Belgrano (Paraná)

Mapa interactivo de los lotes del parque: estado de cada lote, empresas instaladas y lotes disponibles con su superficie y partida. Cada lote tiene un link propio para compartir.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `app.js`, `app.css` | La aplicación |
| `config.js` | Textos, contacto, fuente de datos y ubicación satelital |
| `data/lotes.csv` | Datos públicos de cada lote (copia de la pestaña "Público" de la planilla madre) |
| `data/geometria.json` | La forma de cada lote, extraída del plano de Catastro Municipal |
| `img/plano-limpio.png` | El plano de Catastro sin textos, usado como fondo |

## Datos

La fuente de datos es la planilla madre en Google Sheets, que es privada. Este repositorio solo tiene las columnas públicas. Para que el mapa lea la planilla en vivo, se publica únicamente la pestaña "Público" como CSV (Archivo > Compartir > Publicar en la web) y ese link va en `fuenteDatos` dentro de `config.js`.

Qué se muestra:
- Lotes en actividad, en construcción o sin actividad: la razón social.
- Lotes disponibles y libres: superficie y partida municipal.
- El resto: solo el color del estado.

Base cartográfica: plano de Dirección de Catastro Municipal (2024). Datos preliminares, sujetos a verificación.
