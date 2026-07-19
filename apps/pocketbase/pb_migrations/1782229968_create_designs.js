/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const collection = new Collection({
      type: "base",
      name: "designs",
      listRule: "@request.auth.id != '' && @request.auth.id = owner",
      viewRule: "@request.auth.id != '' && @request.auth.id = owner",
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: "@request.auth.id != '' && @request.auth.id = owner",
      deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
      fields: [
        { name: "title", type: "text", required: true, max: 120 },
        { name: "tool", type: "select", required: true, maxSelect: 1, values: ["mockup", "print", "halftone"] },
        { name: "thumbnail", type: "text", max: 2000000 },
        { name: "config", type: "json", maxSize: 2000000 },
        { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("designs");
    app.delete(collection);
  },
);
