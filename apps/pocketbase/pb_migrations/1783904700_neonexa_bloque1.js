/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // --- extend users with account fields + role ---
    if (!users.fields.getByName("role")) {
      users.fields.add(new SelectField({
        name: "role", required: false, maxSelect: 1, values: ["member", "admin"],
      }));
    }
    const addText = (name, max) => {
      if (!users.fields.getByName(name)) {
        users.fields.add(new TextField({ name, required: false, max }));
      }
    };
    addText("phone", 30);
    addText("company", 160);
    addText("rfc", 20);
    users.listRule = "id = @request.auth.id || @request.auth.role = 'admin'";
    users.viewRule = "id = @request.auth.id || @request.auth.role = 'admin'";
    app.save(users);

    // --- settings (public read, admin write) key/value config ---
    let settings;
    try { settings = app.findCollectionByNameOrId("settings"); } catch (_) {
      settings = new Collection({
        type: "base",
        name: "settings",
        listRule: "",
        viewRule: "",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: "key", type: "text", required: true, max: 80 },
          { name: "value", type: "json", maxSize: 200000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_settings_key ON settings (key)"],
      });
      app.save(settings);
    }

    // --- files (private per user) ---
    let files;
    try { files = app.findCollectionByNameOrId("files"); } catch (_) {
      files = new Collection({
        type: "base",
        name: "files",
        listRule: "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')",
        viewRule: "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')",
        deleteRule: "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')",
        fields: [
          { name: "name", type: "text", required: true, max: 200 },
          { name: "kind", type: "select", required: true, maxSelect: 1, values: ["original", "processed", "approved", "production"] },
          { name: "asset", type: "file", maxSelect: 1, maxSize: 52428800, protected: true },
          { name: "preview", type: "text", max: 3000000 },
          { name: "meta", type: "json", maxSize: 200000 },
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(files);
    }

    // --- orders ---
    let orders;
    try { orders = app.findCollectionByNameOrId("orders"); } catch (_) {
      orders = new Collection({
        type: "base",
        name: "orders",
        listRule: "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')",
        viewRule: "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: "folio", type: "text", required: true, max: 30 },
          { name: "status", type: "select", required: true, maxSelect: 1, values: [
            "recibido", "en_revision", "requiere_correccion", "aprobado", "en_produccion", "listo", "enviado", "entregado", "cancelado",
          ] },
          { name: "payment_status", type: "select", required: false, maxSelect: 1, values: ["pendiente", "pagado", "fallido", "reembolsado"] },
          { name: "items", type: "json", maxSize: 500000 },
          { name: "totals", type: "json", maxSize: 50000 },
          { name: "contact", type: "json", maxSize: 50000 },
          { name: "shipping", type: "json", maxSize: 50000 },
          { name: "billing", type: "json", maxSize: 50000 },
          { name: "events", type: "json", maxSize: 200000 },
          { name: "notes", type: "text", max: 2000 },
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_orders_folio ON orders (folio)"],
      });
      app.save(orders);
    }

    // --- payments ---
    let payments;
    try { payments = app.findCollectionByNameOrId("payments"); } catch (_) {
      payments = new Collection({
        type: "base",
        name: "payments",
        listRule: "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')",
        viewRule: "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        fields: [
          { name: "order", type: "relation", required: false, maxSelect: 1, collectionId: orders.id, cascadeDelete: true },
          { name: "amount", type: "number", required: false },
          { name: "currency", type: "text", max: 8 },
          { name: "method", type: "text", max: 40 },
          { name: "status", type: "select", required: true, maxSelect: 1, values: ["pendiente", "pagado", "fallido", "reembolsado"] },
          { name: "reference", type: "text", max: 120 },
          { name: "meta", type: "json", maxSize: 50000 },
          { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(payments);
    }

    // --- seed default pricing settings ---
    const seed = (key, value) => {
      try { app.findFirstRecordByFilter("settings", "key = {:k}", { k: key }); }
      catch (_) {
        const r = new Record(settings);
        r.set("key", key);
        r.set("value", value);
        app.save(r);
      }
    };
    seed("pricing_textil", {
      currency: "MXN",
      tiers: [
        { min: 1, max: 4, price: 200 },
        { min: 5, max: 9999, price: 180 },
      ],
      minMeters: 0.5,
    });
    seed("pricing_uv", {
      currency: "MXN",
      modes: {
        hoja: { label: "Por hoja (A3)", unit: "hoja", price: 85 },
        medida: { label: "Por medida (m²)", unit: "m²", price: 950 },
        metro: { label: "Por metro lineal", unit: "m", price: 260 },
        proyecto: { label: "Por proyecto", unit: "proyecto", price: 500 },
      },
      surcharges: { blanco: 0.15, barniz: 0.20 },
    });
    seed("upload_rules", {
      formats: ["png", "jpg", "jpeg", "pdf", "tiff", "svg"],
      maxSizeMB: 50,
      minDPI: 150,
    });

    // --- seed admin user ---
    try { app.findAuthRecordByEmail("users", "admin@neonexa.com"); }
    catch (_) {
      const admin = new Record(users);
      admin.setEmail("admin@neonexa.com");
      admin.setPassword("neonexaadmin1");
      admin.set("name", "Neonexa Admin");
      admin.set("role", "admin");
      admin.set("verified", true);
      app.save(admin);
    }
  },
  (app) => {
    for (const name of ["payments", "orders", "files", "settings"]) {
      try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
    }
    try {
      const users = app.findCollectionByNameOrId("users");
      for (const f of ["role", "phone", "company", "rfc"]) {
        try { users.fields.removeByName(f); } catch (_) {}
      }
      app.save(users);
    } catch (_) {}
  },
);
