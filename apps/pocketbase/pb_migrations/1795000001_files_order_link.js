/// <reference path="../pb_data/types.d.ts" />

// Links a file to the order it belongs to (files were previously only
// scoped to the owning user), and this is what finally makes the
// original/processed/approved/production "kind" versioning meaningful —
// production staff can now see and add versions against a specific order.

migrate(
  (app) => {
    const files = app.findCollectionByNameOrId("files");
    const orders = app.findCollectionByNameOrId("orders");
    if (!files.fields.getByName("order")) {
      files.fields.add(new RelationField({
        name: "order", required: false, maxSelect: 1, collectionId: orders.id, cascadeDelete: false,
      }));
    }
    // Production staff need to upload processed/approved versions on behalf
    // of the customer (owner stays the customer, not whoever uploaded it).
    files.createRule = "@request.auth.id != '' && (@request.auth.id = @request.body.owner || ((@request.auth.role = 'admin' || @request.auth.role = 'operador') && @request.body.kind != 'original'))";
    files.updateRule = "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin' || @request.auth.role = 'operador')";
    app.save(files);
  },
  (app) => {
    const files = app.findCollectionByNameOrId("files");
    try { files.fields.removeByName("order"); } catch (_) {}
    files.createRule = "@request.auth.id != '' && @request.auth.id = @request.body.owner";
    files.updateRule = "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')";
    app.save(files);
  },
);
