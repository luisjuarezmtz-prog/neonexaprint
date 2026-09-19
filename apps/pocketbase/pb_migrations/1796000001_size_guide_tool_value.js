/// <reference path="../pb_data/types.d.ts" />

// La Guia de Medidas se agrego a lib/tools.js pero no a los select de
// tool_jobs.tool ni tool_limits.tool, que traen la lista fija desde
// 1783908760_neonexa_bloque3.js. recordJob() atrapa el error y solo lo
// registra en consola, asi que la descarga funcionaba pero el trabajo nunca
// se guardaba: historial vacio y sin forma de recuperar la guia despues.
// Tambien deja la herramienta disponible para ponerle limite por plan.

const TOOL = "size-guide";

function addValue(app, collectionName) {
  const collection = app.findCollectionByNameOrId(collectionName);
  const field = collection.fields.getByName("tool");
  if (field && field.values.indexOf(TOOL) === -1) {
    field.values = field.values.concat([TOOL]);
    app.save(collection);
  }
}

function removeValue(app, collectionName) {
  const collection = app.findCollectionByNameOrId(collectionName);
  const field = collection.fields.getByName("tool");
  if (field) {
    field.values = field.values.filter((v) => v !== TOOL);
    app.save(collection);
  }
}

migrate(
  (app) => {
    addValue(app, "tool_jobs");
    addValue(app, "tool_limits");
  },
  (app) => {
    removeValue(app, "tool_jobs");
    removeValue(app, "tool_limits");
  },
);
