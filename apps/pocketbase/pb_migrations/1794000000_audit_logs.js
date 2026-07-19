/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const adminWrite = "@request.auth.id != '' && @request.auth.role = 'admin'";

    let logs;
    try { logs = app.findCollectionByNameOrId("audit_logs"); } catch (_) {
      logs = new Collection({
        type: "base",
        name: "audit_logs",
        listRule: adminWrite,
        viewRule: adminWrite,
        createRule: null, // only written by server hooks (bypass rules); nobody creates via API
        updateRule: null, // immutable — not even admins can edit/delete a log entry via API
        deleteRule: null,
        fields: [
          { name: "actor", type: "relation", required: false, maxSelect: 1, collectionId: users.id },
          { name: "actor_label", type: "text", max: 200 },
          { name: "action", type: "select", required: true, maxSelect: 1, values: ["create", "update", "delete"] },
          { name: "collection_name", type: "text", required: true, max: 80 },
          { name: "record_id", type: "text", max: 40 },
          { name: "summary", type: "text", max: 400 },
          { name: "changes", type: "json", maxSize: 100000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        ],
      });
      app.save(logs);
    }
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId("audit_logs")); } catch (_) {}
  },
);
