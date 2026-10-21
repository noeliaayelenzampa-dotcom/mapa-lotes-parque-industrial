// Configuración del mapa de lotes. Es el único archivo que hace falta tocar
// para cambiar textos, la fuente de datos o la ubicación satelital.
window.PARQUE_CONFIG = {
  nombre: "Parque Industrial General Manuel Belgrano",
  subtitulo: "Paraná, Entre Ríos · Lotes y parcelas",
  fuentePlano: "Plano de Dirección de Catastro Municipal (2024)",

  // Contacto que ve el interesado en cada ficha.
  contacto: {
    area: "Dirección del Parque Industrial · Municipalidad de Paraná",
    email: "",
    telefono: ""
  },

  // De dónde salen los datos de cada lote.
  // Por defecto, el archivo data/lotes.csv del repositorio.
  // Para usar una Google Sheet: Archivo > Compartir > Publicar en la web >
  // formato CSV, y pegar acá el link que te da.
  fuenteDatos: "data/lotes.csv",

  // Link público del mapa (para armar los links de cada lote).
  // Si queda vacío se usa la dirección actual de la página.
  urlPublica: "",

  // En la vista pública no se muestran los titulares que figuran en el plano.
  // En el modo gestión (agregar #gestion al final del link) sí.
  mostrarTitularPublico: false,

  // Puntos de control para ubicar el plano sobre la imagen satelital.
  // Se generan con la herramienta "Ubicar en satélite" del modo gestión.
  // Formato: { nombre, plano: [y, x], gps: [lat, lng] }
  georef: [
    {"nombre": "Hernandarias y Arq. Walter Grand", "plano": [-423.75, 1180], "gps": [-31.768788, -60.446883]},
    {"nombre": "Hernandarias y Salellas", "plano": [-429.76, 496], "gps": [-31.767073, -60.458292]},
    {"nombre": "Salellas y Robinson", "plano": [-1109.91, 494], "gps": [-31.776801, -60.460239]}
  ],

  // Versión pública: sin botón de modo gestión (se entra con #gestion)
  // y sin el plano completo de Catastro, que no se publica.
  mostrarBotonGestion: false,
  planoCompleto: false
};
