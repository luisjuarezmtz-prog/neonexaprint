/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const purchases = app.findCollectionByNameOrId("pack_purchases");
    if (!purchases.fields.getByName("meta")) {
      purchases.fields.add(new JSONField({ name: "meta", maxSize: 50000 }));
    }
    app.save(purchases);
  },
  (app) => {
    const purchases = app.findCollectionByNameOrId("pack_purchases");
    try { purchases.fields.removeByName("meta"); } catch (_) {}
    app.save(purchases);
  },
);
