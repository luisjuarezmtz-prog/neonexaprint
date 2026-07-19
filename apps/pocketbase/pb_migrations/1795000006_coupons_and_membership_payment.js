/// <reference path="../pb_data/types.d.ts" />

// Two related fixes:
// 1. Real coupons collection + server-side validation, replacing the two
//    hardcoded strings (NEONEXA10/NEONEXA20) that lived in the Membresías
//    frontend with no expiration, usage limit, or server check.
// 2. Membership subscriptions never actually charged anything — subscribe()
//    just set memberships.status = "activa" directly client-side. This adds
//    the plumbing (a "pendiente" status + payment_status/meta on
//    membership_history, mirroring how payments/orders already work) so a
//    membership only activates once Mercado Pago's webhook confirms payment.

migrate(
  (app) => {
    const adminOnly = "@request.auth.id != '' && @request.auth.role = 'admin'";

    let coupons;
    try { coupons = app.findCollectionByNameOrId("coupons"); } catch (_) {
      coupons = new Collection({
        type: "base",
        name: "coupons",
        listRule: adminOnly,
        viewRule: adminOnly,
        createRule: adminOnly,
        updateRule: adminOnly,
        deleteRule: adminOnly,
        fields: [
          { name: "code", type: "text", required: true, max: 40 },
          { name: "discount_type", type: "select", required: true, maxSelect: 1, values: ["percent", "fixed"] },
          { name: "discount_value", type: "number", required: true },
          { name: "applies_to", type: "select", required: true, maxSelect: 1, values: ["membership", "order", "all"] },
          { name: "max_uses", type: "number" },
          { name: "used_count", type: "number" },
          { name: "min_amount", type: "number" },
          { name: "valid_from", type: "date" },
          { name: "valid_until", type: "date" },
          { name: "active", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_coupons_code ON coupons (code)"],
      });
      app.save(coupons);
    }

    const memberships = app.findCollectionByNameOrId("memberships");
    const statusField = memberships.fields.getByName("status");
    if (statusField && statusField.values.indexOf("pendiente") === -1) {
      statusField.values = ["pendiente", "prueba", "activa", "vencida", "cancelada", "pago_fallido"];
      app.save(memberships);
    }

    const plans = app.findCollectionByNameOrId("membership_plans");
    const history = app.findCollectionByNameOrId("membership_history");
    if (!history.fields.getByName("payment_status")) {
      history.fields.add(new SelectField({
        name: "payment_status", maxSelect: 1, values: ["pendiente", "pagado", "fallido", "reembolsado"],
      }));
    }
    if (!history.fields.getByName("meta")) {
      history.fields.add(new JSONField({ name: "meta", maxSize: 50000 }));
    }
    // the plan this payment attempt is FOR — kept separate from
    // memberships.plan so a pending plan change doesn't overwrite the
    // customer's still-active current plan before the webhook confirms it.
    if (!history.fields.getByName("plan")) {
      history.fields.add(new RelationField({ name: "plan", required: false, maxSelect: 1, collectionId: plans.id, cascadeDelete: false }));
    }
    app.save(history);
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId("coupons")); } catch (_) {}

    try {
      const memberships = app.findCollectionByNameOrId("memberships");
      const statusField = memberships.fields.getByName("status");
      if (statusField) statusField.values = ["prueba", "activa", "vencida", "cancelada", "pago_fallido"];
      app.save(memberships);
    } catch (_) {}

    try {
      const history = app.findCollectionByNameOrId("membership_history");
      try { history.fields.removeByName("payment_status"); } catch (_) {}
      try { history.fields.removeByName("meta"); } catch (_) {}
      try { history.fields.removeByName("plan"); } catch (_) {}
      app.save(history);
    } catch (_) {}
  },
);
