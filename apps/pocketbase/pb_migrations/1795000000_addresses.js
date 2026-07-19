/// <reference path="../pb_data/types.d.ts" />

// Reusable saved addresses for the client's account (shipping/billing),
// instead of re-typing them on every order.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const ownerRW = "@request.auth.id != '' && @request.auth.id = owner";

    let addresses;
    try { addresses = app.findCollectionByNameOrId("addresses"); } catch (_) {
      addresses = new Collection({
        type: "base",
        name: "addresses",
        listRule: ownerRW,
        viewRule: ownerRW,
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: ownerRW,
        deleteRule: ownerRW,
        fields: [
          { name: "label", type: "text", required: true, max: 60 },
          { name: "street", type: "text", required: true, max: 200 },
          { name: "city", type: "text", required: true, max: 100 },
          { name: "state", type: "text", required: true, max: 100 },
          { name: "zip", type: "text", required: true, max: 12 },
          { name: "phone", type: "text", max: 30 },
          { name: "is_default", type: "bool" },
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(addresses);
    }
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId("addresses")); } catch (_) {}
  },
);
