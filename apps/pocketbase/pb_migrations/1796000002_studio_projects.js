/// <reference path="../pb_data/types.d.ts" />

// NEONEXA STUDIO — Paso 1 del roadmap V2: el sistema de proyectos.
//
// Hoy cada herramienta es un callejon sin salida: se sube un archivo, se
// procesa y se descarga. Para encadenar dos pasos hay que bajar el PNG y
// volverlo a subir, y no queda registro de que se le hizo al arte.
//
// Un proyecto es el archivo a lo largo del tiempo: conserva el original
// intacto, el estado actual, y la lista de pasos que llevo de uno al otro.
//
//   original ──▶ [quitar fondo] ──▶ [halftone] ──▶ current
//                     └──────── steps[] ────────┘
//
// DECISIONES QUE VALE LA PENA CONOCER
//
// - `original` nunca se reescribe. Es la garantia de "el archivo original
//   siempre se conserva" que todas las herramientas ya prometen en pantalla,
//   y lo que hace posible deshacer hasta el inicio.
// - `steps` es JSON y no una coleccion aparte: un proyecto tipico trae menos
//   de veinte pasos y siempre se leen juntos. Una relacion obligaria a un
//   request extra por cada apertura sin dar nada a cambio.
// - Los pasos guardan el motor y sus parametros, no el pixel intermedio.
//   Re-ejecutar es barato -los motores corren en el navegador- y guardar un
//   PNG por paso llenaria el disco del hosting en semanas.
// - `width_cm` manda sobre el DPI: el taller decide a que tamano imprime y el
//   DPI es consecuencia. Guardar DPI como dato suelto invita a que se
//   contradiga con el tamano real.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const ownerRead = "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')";
    const ownerCreate = "@request.auth.id != '' && @request.auth.id = @request.body.owner";

    let collection;
    try {
      collection = app.findCollectionByNameOrId("studio_projects");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "studio_projects",
        listRule: ownerRead,
        viewRule: ownerRead,
        createRule: ownerCreate,
        updateRule: ownerRead,
        deleteRule: ownerRead,
        fields: [
          { name: "name", type: "text", required: true, max: 200 },
          { name: "client", type: "text", max: 200 },

          // El archivo tal como lo subio el usuario. No se reescribe nunca.
          { name: "original", type: "file", maxSelect: 1, maxSize: 52428800,
            mimeTypes: ["image/png", "image/jpeg", "image/webp"] },
          // Estado actual tras aplicar los pasos. Se reemplaza en cada guardado.
          { name: "current", type: "file", maxSelect: 1, maxSize: 52428800,
            mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] },
          { name: "preview", type: "text", max: 3000000 },

          // [{ id, engine, params, at, label }] en orden de aplicacion.
          { name: "steps", type: "json", maxSize: 400000 },
          // Cuantos pasos estan activos. Deshacer mueve este numero sin
          // borrar el historial, asi que rehacer es gratis.
          { name: "step_cursor", type: "number" },

          // Intencion de impresion. El DPI efectivo se deriva de aqui.
          { name: "width_cm", type: "number" },
          { name: "garment", type: "text", max: 60 },
          { name: "garment_color", type: "text", max: 20 },
          { name: "quantity", type: "number" },

          // Ultimo analisis del Inspector: { score, metrics, notes }.
          { name: "analysis", type: "json", maxSize: 200000 },
          { name: "dtf_score", type: "number" },

          { name: "status", type: "select", required: true, maxSelect: 1,
            values: ["borrador", "revisar", "listo", "en_gang_sheet", "producido", "archivado"] },
          { name: "notes", type: "text", max: 2000 },

          { name: "owner", type: "relation", required: true, maxSelect: 1,
            collectionId: users.id, cascadeDelete: true },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_studio_projects_owner ON studio_projects (owner)",
          "CREATE INDEX idx_studio_projects_status ON studio_projects (owner, status)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("studio_projects"));
    } catch (_) { /* nunca se creo */ }
  },
);
