/// <reference path="../pb_data/types.d.ts" />

// orders.items was a free-form JSON blob fed by three incompatible shapes
// (DTF Textil/UV, Personalizados, and a fake "cotizacion" item type used to
// smuggle quote-only requests into the orders collection). This splits that
// into real relational order_items (one row per line, linked to the parent
// order and, when applicable, to the real product/variant/file records) and
// a first-class quotes collection for kits corporativos / proyectos
// especiales requests, which previously existed only as an order with no
// payment and a made-up item.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const orders = app.findCollectionByNameOrId("orders");
    const products = app.findCollectionByNameOrId("products");
    const productVariants = app.findCollectionByNameOrId("product_variants");
    const files = app.findCollectionByNameOrId("files");

    const staffRead = "@request.auth.id != '' && (order.owner = @request.auth.id || @request.auth.role = 'admin' || @request.auth.role = 'operador' || @request.auth.role = 'ventas')";
    const staffOnly = "@request.auth.id != '' && (@request.auth.role = 'admin' || @request.auth.role = 'operador' || @request.auth.role = 'ventas')";

    let orderItems;
    try { orderItems = app.findCollectionByNameOrId("order_items"); } catch (_) {
      orderItems = new Collection({
        type: "base",
        name: "order_items",
        listRule: staffRead,
        viewRule: staffRead,
        createRule: "@request.auth.id != '' && @request.body.order.owner = @request.auth.id",
        updateRule: staffOnly,
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: "order", type: "relation", required: true, maxSelect: 1, collectionId: orders.id, cascadeDelete: true },
          { name: "service", type: "select", required: true, maxSelect: 1, values: ["dtf_textil", "dtf_uv", "producto"] },
          { name: "title", type: "text", required: true, max: 200 },
          { name: "product", type: "relation", required: false, maxSelect: 1, collectionId: products.id, cascadeDelete: false },
          { name: "variant", type: "relation", required: false, maxSelect: 1, collectionId: productVariants.id, cascadeDelete: false },
          { name: "file", type: "relation", required: false, maxSelect: 1, collectionId: files.id, cascadeDelete: false },
          { name: "thumb", type: "text", max: 300000 },
          { name: "config", type: "json", maxSize: 100000 },
          { name: "qty", type: "number", required: true },
          { name: "subtotal", type: "number", required: true },
          { name: "unit_label", type: "text", max: 60 },
          { name: "currency", type: "text", max: 8 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(orderItems);
    }

    let quotes;
    try { quotes = app.findCollectionByNameOrId("quotes"); } catch (_) {
      quotes = new Collection({
        type: "base",
        name: "quotes",
        listRule: "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin' || @request.auth.role = 'operador' || @request.auth.role = 'ventas')",
        viewRule: "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin' || @request.auth.role = 'operador' || @request.auth.role = 'ventas')",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: staffOnly,
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: "folio", type: "text", required: true, max: 30 },
          { name: "status", type: "select", required: true, maxSelect: 1, values: [
            "nueva", "en_revision", "cotizada", "aceptada", "rechazada", "expirada",
          ] },
          { name: "product", type: "relation", required: true, maxSelect: 1, collectionId: products.id, cascadeDelete: false },
          { name: "variant", type: "relation", required: false, maxSelect: 1, collectionId: productVariants.id, cascadeDelete: false },
          { name: "qty", type: "number", required: true },
          { name: "company", type: "text", max: 200 },
          { name: "budget", type: "number", required: false },
          { name: "wanted", type: "text", max: 2000 },
          { name: "instructions", type: "text", max: 2000 },
          { name: "due_date", type: "date", required: false },
          { name: "design_mode", type: "select", required: false, maxSelect: 1, values: ["upload", "help"] },
          { name: "file", type: "relation", required: false, maxSelect: 1, collectionId: files.id, cascadeDelete: false },
          { name: "quoted_amount", type: "number", required: false },
          { name: "quoted_notes", type: "text", max: 2000 },
          { name: "contact", type: "json", maxSize: 50000 },
          { name: "notes", type: "text", max: 2000 },
          { name: "events", type: "json", maxSize: 200000 },
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_quotes_folio ON quotes (folio)"],
      });
      app.save(quotes);
    }
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId("quotes")); } catch (_) {}
    try { app.delete(app.findCollectionByNameOrId("order_items")); } catch (_) {}
  },
);
