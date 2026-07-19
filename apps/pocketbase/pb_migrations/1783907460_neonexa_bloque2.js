/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const orders = app.findCollectionByNameOrId("orders");

    const adminWrite = "@request.auth.id != '' && @request.auth.role = 'admin'";
    const ownerRead = "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')";

    const create = (name, def) => {
      try { return app.findCollectionByNameOrId(name); } catch (_) {
        const c = new Collection(Object.assign({ type: "base", name }, def));
        app.save(c);
        return c;
      }
    };

    const ownerField = { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true };
    const dates = [
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ];

    // --- notification_templates (admin managed, public read) ---
    create("notification_templates", {
      listRule: "", viewRule: "", createRule: adminWrite, updateRule: adminWrite, deleteRule: adminWrite,
      fields: [
        { name: "event", type: "text", required: true, max: 60 },
        { name: "label", type: "text", required: true, max: 120 },
        { name: "channel", type: "select", required: true, maxSelect: 1, values: ["email", "whatsapp"] },
        { name: "subject", type: "text", max: 200 },
        { name: "body", type: "text", max: 4000 },
        { name: "enabled", type: "bool" },
        ...dates,
      ],
      indexes: ["CREATE UNIQUE INDEX idx_notif_tpl ON notification_templates (event, channel)"],
    });

    // --- notification_settings: which order statuses notify the client ---
    create("notification_settings", {
      listRule: "", viewRule: "", createRule: adminWrite, updateRule: adminWrite, deleteRule: adminWrite,
      fields: [
        { name: "event", type: "text", required: true, max: 60 },
        { name: "label", type: "text", required: true, max: 120 },
        { name: "notify_client", type: "bool" },
        { name: "email", type: "bool" },
        { name: "whatsapp", type: "bool" },
        ...dates,
      ],
      indexes: ["CREATE UNIQUE INDEX idx_notif_set ON notification_settings (event)"],
    });

    // --- notifications (per user inbox) ---
    create("notifications", {
      listRule: ownerRead, viewRule: ownerRead,
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: ownerRead, deleteRule: ownerRead,
      fields: [
        { name: "title", type: "text", required: true, max: 200 },
        { name: "message", type: "text", max: 2000 },
        { name: "type", type: "text", max: 60 },
        { name: "channel", type: "select", maxSelect: 1, values: ["inapp", "email", "whatsapp"] },
        { name: "read", type: "bool" },
        { name: "link", type: "text", max: 200 },
        ownerField,
        ...dates,
      ],
    });

    // --- products (custom / personalizados catalog) ---
    create("products", {
      listRule: "", viewRule: "", createRule: adminWrite, updateRule: adminWrite, deleteRule: adminWrite,
      fields: [
        { name: "name", type: "text", required: true, max: 160 },
        { name: "slug", type: "text", required: true, max: 160 },
        { name: "category", type: "select", required: true, maxSelect: 1, values: [
          "playeras", "gorras", "termos", "tazas", "bolsas", "regalos_empresariales", "kits_corporativos", "proyectos_especiales",
        ] },
        { name: "description", type: "text", max: 2000 },
        { name: "image", type: "text", max: 500 },
        { name: "base_price", type: "number" },
        { name: "quote_only", type: "bool" },
        { name: "active", type: "bool" },
        ...dates,
      ],
      indexes: ["CREATE UNIQUE INDEX idx_products_slug ON products (slug)"],
    });

    const products = app.findCollectionByNameOrId("products");

    // --- product_variants ---
    create("product_variants", {
      listRule: "", viewRule: "", createRule: adminWrite, updateRule: adminWrite, deleteRule: adminWrite,
      fields: [
        { name: "product", type: "relation", required: true, maxSelect: 1, collectionId: products.id, cascadeDelete: true },
        { name: "model", type: "text", max: 120 },
        { name: "color", type: "text", max: 60 },
        { name: "size", type: "text", max: 40 },
        { name: "price_delta", type: "number" },
        { name: "active", type: "bool" },
        ...dates,
      ],
    });

    // --- membership_plans (admin managed, public read) ---
    create("membership_plans", {
      listRule: "", viewRule: "", createRule: adminWrite, updateRule: adminWrite, deleteRule: adminWrite,
      fields: [
        { name: "name", type: "text", required: true, max: 120 },
        { name: "interval", type: "select", required: true, maxSelect: 1, values: ["mensual", "anual"] },
        { name: "price", type: "number" },
        { name: "currency", type: "text", max: 8 },
        { name: "benefits", type: "json", maxSize: 50000 },
        { name: "limits", type: "json", maxSize: 50000 },
        { name: "highlight", type: "bool" },
        { name: "active", type: "bool" },
        { name: "sort", type: "number" },
        ...dates,
      ],
    });

    const plans = app.findCollectionByNameOrId("membership_plans");

    // --- memberships (per user) ---
    create("memberships", {
      listRule: ownerRead, viewRule: ownerRead,
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: ownerRead, deleteRule: adminWrite,
      fields: [
        { name: "plan", type: "relation", required: false, maxSelect: 1, collectionId: plans.id, cascadeDelete: false },
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["prueba", "activa", "vencida", "cancelada", "pago_fallido"] },
        { name: "period_start", type: "date" },
        { name: "period_end", type: "date" },
        { name: "cancel_at_period_end", type: "bool" },
        { name: "coupon", type: "text", max: 40 },
        { name: "auto_renew", type: "bool" },
        { name: "meta", type: "json", maxSize: 50000 },
        ownerField,
        ...dates,
      ],
    });

    const memberships = app.findCollectionByNameOrId("memberships");

    // --- membership_history (billing history) ---
    create("membership_history", {
      listRule: ownerRead, viewRule: ownerRead,
      createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
      updateRule: adminWrite, deleteRule: adminWrite,
      fields: [
        { name: "membership", type: "relation", required: false, maxSelect: 1, collectionId: memberships.id, cascadeDelete: true },
        { name: "action", type: "select", required: true, maxSelect: 1, values: [
          "alta", "renovacion", "cambio_plan", "cancelacion", "pago_exitoso", "pago_fallido", "prueba_iniciada",
        ] },
        { name: "amount", type: "number" },
        { name: "currency", type: "text", max: 8 },
        { name: "note", type: "text", max: 500 },
        { name: "coupon", type: "text", max: 40 },
        ownerField,
        ...dates,
      ],
    });

    // --- production_events (order status changes with audit) ---
    create("production_events", {
      listRule: ownerRead, viewRule: ownerRead,
      createRule: "@request.auth.id != ''",
      updateRule: adminWrite, deleteRule: adminWrite,
      fields: [
        { name: "order", type: "relation", required: true, maxSelect: 1, collectionId: orders.id, cascadeDelete: true },
        { name: "status", type: "text", required: true, max: 40 },
        { name: "comment", type: "text", max: 1000 },
        { name: "by_name", type: "text", max: 160 },
        { name: "notified", type: "bool" },
        ownerField,
        ...dates,
      ],
    });

    // ================= SEEDS =================
    const settings = app.findCollectionByNameOrId("settings");
    const seedSetting = (key, value) => {
      try { app.findFirstRecordByFilter("settings", "key = {:k}", { k: key }); }
      catch (_) { const r = new Record(settings); r.set("key", key); r.set("value", value); app.save(r); }
    };
    seedSetting("membership_config", { trialDays: 7, currency: "MXN" });
    seedSetting("whatsapp_config", { number: "56110050049", display: "+56 1105 0049", consentRequired: true });

    // notification settings (order lifecycle)
    const notifEvents = [
      ["registro", "Registro y verificación de email", true, true, false],
      ["pedido_confirmado", "Confirmación de pedido", true, true, true],
      ["pago_confirmado", "Confirmación de pago", true, true, true],
      ["requiere_correccion", "Archivo con incidencia", true, true, true],
      ["aprobado", "Aprobación de archivo", true, true, false],
      ["en_produccion", "Inicio de producción", true, true, false],
      ["listo", "Fin de producción / Pedido listo", true, true, true],
      ["enviado", "Pedido enviado", true, true, true],
      ["entregado", "Pedido entregado", true, true, false],
      ["membresia_renovacion", "Renovación próxima de membresía", true, true, false],
      ["pago_recurrente_exitoso", "Pago recurrente exitoso", true, true, false],
      ["pago_recurrente_fallido", "Pago recurrente fallido", true, true, true],
    ];
    const nsCol = app.findCollectionByNameOrId("notification_settings");
    for (const [event, label, notify, email, wa] of notifEvents) {
      try { app.findFirstRecordByFilter("notification_settings", "event = {:e}", { e: event }); }
      catch (_) {
        const r = new Record(nsCol);
        r.set("event", event); r.set("label", label);
        r.set("notify_client", notify); r.set("email", email); r.set("whatsapp", wa);
        app.save(r);
      }
    }

    // notification email templates
    const tplCol = app.findCollectionByNameOrId("notification_templates");
    const tpls = [
      ["pedido_confirmado", "Confirmación de pedido", "email", "Tu pedido {folio} fue recibido", "Hola {name}, recibimos tu pedido {folio}. Te avisaremos cuando cambie de estado."],
      ["pago_confirmado", "Confirmación de pago", "email", "Pago confirmado — {folio}", "Hola {name}, confirmamos el pago de tu pedido {folio}. ¡Gracias!"],
      ["requiere_correccion", "Archivo con incidencia", "email", "Tu archivo requiere corrección — {folio}", "Hola {name}, tu archivo del pedido {folio} tiene una incidencia. Revisa tu panel para más detalles."],
      ["aprobado", "Archivo aprobado", "email", "Archivo aprobado — {folio}", "Hola {name}, tu archivo del pedido {folio} fue aprobado y pasa a producción."],
      ["en_produccion", "Inicio de producción", "email", "Tu pedido está en producción — {folio}", "Hola {name}, comenzamos la producción de tu pedido {folio}."],
      ["listo", "Pedido listo", "email", "Tu pedido está listo — {folio}", "Hola {name}, tu pedido {folio} está listo."],
      ["enviado", "Pedido enviado", "email", "Tu pedido va en camino — {folio}", "Hola {name}, tu pedido {folio} fue enviado."],
      ["membresia_renovacion", "Renovación de membresía", "email", "Tu membresía se renueva pronto", "Hola {name}, tu membresía se renovará el {date}."],
    ];
    for (const [event, label, channel, subject, body] of tpls) {
      try { app.findFirstRecordByFilter("notification_templates", "event = {:e} && channel = {:c}", { e: event, c: channel }); }
      catch (_) {
        const r = new Record(tplCol);
        r.set("event", event); r.set("label", label); r.set("channel", channel);
        r.set("subject", subject); r.set("body", body); r.set("enabled", true);
        app.save(r);
      }
    }

    // membership plans
    const planCol = app.findCollectionByNameOrId("membership_plans");
    const seedPlans = [
      ["Neonexa Tools Mensual", "mensual", 199, "MXN",
        ["Acceso a todas las Neonexa Tools", "Exporta en alta calidad 300 DPI", "Soporte prioritario por WhatsApp"],
        { mockup: 100, print: 200, halftone: 100, storageMB: 500 }, false, 1],
      ["Neonexa Tools Anual", "anual", 1990, "MXN",
        ["Todo lo del plan mensual", "2 meses gratis vs mensual", "Almacenamiento ampliado", "Acceso anticipado a nuevas tools"],
        { mockup: -1, print: -1, halftone: -1, storageMB: 5000 }, true, 2],
    ];
    for (const [name, interval, price, currency, benefits, limits, highlight, sort] of seedPlans) {
      try { app.findFirstRecordByFilter("membership_plans", "name = {:n}", { n: name }); }
      catch (_) {
        const r = new Record(planCol);
        r.set("name", name); r.set("interval", interval); r.set("price", price); r.set("currency", currency);
        r.set("benefits", benefits); r.set("limits", limits); r.set("highlight", highlight);
        r.set("active", true); r.set("sort", sort);
        app.save(r);
      }
    }

    // products
    const prodCol = app.findCollectionByNameOrId("products");
    const varCol = app.findCollectionByNameOrId("product_variants");
    const seedProducts = [
      ["Playera Premium DTF", "playera-premium-dtf", "playeras", "Algodón 180g, impresión DTF a todo color con blanco.", "https://images.hostinger.com/b951f346-3a73-4fc7-b1e0-fbc291cc5892.png", 189, false,
        [["Unisex", "Blanco", "M", 0], ["Unisex", "Blanco", "L", 0], ["Unisex", "Negro", "M", 20], ["Unisex", "Negro", "L", 20]]],
      ["Gorra Bordada", "gorra-bordada", "gorras", "Gorra ajustable con bordado o transfer personalizado.", "https://images.hostinger.com/2e414043-c171-40ef-945a-cf788d2c99ce.png", 149, false,
        [["Snapback", "Negro", "Única", 0], ["Trucker", "Azul", "Única", 10]]],
      ["Termo 600ml", "termo-600ml", "termos", "Acero inoxidable, conserva 12h frío / 6h caliente.", "https://images.hostinger.com/46dc9591-c52a-48f3-8f24-c11c77860d4c.png", 249, false,
        [["Clásico", "Plata", "600ml", 0], ["Mate", "Negro", "600ml", 30]]],
      ["Taza Personalizada", "taza-personalizada", "tazas", "Sublimación premium, brillo antirayaduras.", "https://images.hostinger.com/b951f346-3a73-4fc7-b1e0-fbc291cc5892.png", 129, false,
        [["Cerámica", "Blanco", "11oz", 0], ["Mágica", "Negro→Blanco", "11oz", 40]]],
      ["Bolsa Tote", "bolsa-tote", "bolsas", "Bolsa ecológica de algodón con tu diseño.", "https://images.hostinger.com/2e414043-c171-40ef-945a-cf788d2c99ce.png", 99, false,
        [["Natural", "Crudo", "Estándar", 0]]],
      ["Regalo Empresarial", "regalo-empresarial", "regalos_empresariales", "Set de regalo personalizado para clientes y equipo.", "https://images.hostinger.com/46dc9591-c52a-48f3-8f24-c11c77860d4c.png", null, true, []],
      ["Kit Corporativo", "kit-corporativo", "kits_corporativos", "Playera + termo + sticker en caja premium para tu equipo.", "https://images.hostinger.com/b951f346-3a73-4fc7-b1e0-fbc291cc5892.png", null, true, []],
      ["Proyecto Especial", "proyecto-especial", "proyectos_especiales", "¿Algo fuera de catálogo? Cuéntanos tu idea y la hacemos realidad.", "https://images.hostinger.com/2e414043-c171-40ef-945a-cf788d2c99ce.png", null, true, []],
    ];
    for (const [name, slug, category, description, image, base_price, quote_only, variants] of seedProducts) {
      let prod;
      try { prod = app.findFirstRecordByFilter("products", "slug = {:s}", { s: slug }); }
      catch (_) {
        prod = new Record(prodCol);
        prod.set("name", name); prod.set("slug", slug); prod.set("category", category);
        prod.set("description", description); prod.set("image", image);
        if (base_price != null) prod.set("base_price", base_price);
        prod.set("quote_only", quote_only); prod.set("active", true);
        app.save(prod);
        for (const [model, color, size, delta] of variants) {
          const v = new Record(varCol);
          v.set("product", prod.id); v.set("model", model); v.set("color", color);
          v.set("size", size); v.set("price_delta", delta); v.set("active", true);
          app.save(v);
        }
      }
    }
  },
  (app) => {
    for (const name of [
      "production_events", "membership_history", "memberships", "membership_plans",
      "product_variants", "products", "notifications", "notification_settings", "notification_templates",
    ]) {
      try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
    }
  },
);
