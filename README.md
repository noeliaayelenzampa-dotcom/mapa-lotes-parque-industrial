# Parque Industrial General Manuel Belgrano (Paraná) · Sitio y mapa de lotes

Sitio público del parque: página de inicio con lotes disponibles, beneficios para radicarse, servicios y directorio de empresas, más el mapa interactivo de lotes. Cada lote tiene un link propio para compartir.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `sitio.js`, `sitio.css` | Página de inicio |
| `mapa.html`, `app.js`, `app.css` | Mapa interactivo de lotes (modo gestión: `mapa.html#gestion`) |
| `config.js` | Textos, contacto, cifras de la portada, fuente de datos y ubicación satelital |
| `data/lotes.csv` | Datos públicos de cada lote (copia de la pestaña "Público" de la planilla madre) |
| `data/empresas.csv` | Directorio público de empresas (de la pestaña "Empresas" de la planilla madre) |
| `data/geometria.json` | La forma de cada lote, extraída del plano de Catastro Municipal |
| `img/plano-limpio.png` | El plano de Catastro sin textos, usado como fondo del mapa |
| `img/logos/` | Logos de las empresas |

## Datos

La fuente de datos es la planilla madre en Google Sheets, que es privada. Este repositorio solo tiene las columnas públicas.

Qué se muestra:
- Lotes en actividad, en construcción o sin actividad: la razón social.
- Lotes disponibles: condición, superficie y código de lote. Las partidas no se publican.
- Empresas: las marcadas "sí" en la columna Publicar muestran logo, actividad y web; las "pendiente", solo nombre y sector; las "no" no aparecen.

Base cartográfica: plano de Dirección de Catastro Municipal (2024). Datos preliminares, sujetos a verificación.
