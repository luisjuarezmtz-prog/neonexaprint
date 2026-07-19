/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const images = {
      "playera-premium-dtf": "https://images.hostinger.com/e4bcd2f8-72f0-4bb0-b98b-b1707615f86d.png",
      "gorra-bordada": "https://images.hostinger.com/bf67e846-e850-4c57-90ef-b529e2d71802.png",
      "termo-600ml": "https://images.hostinger.com/73b6acdb-ff80-4190-91ea-76becd91a24f.png",
      "taza-personalizada": "https://images.hostinger.com/87c0ef91-8431-4c7a-8682-55825ff4a844.png",
      "bolsa-tote": "https://images.hostinger.com/b6b55c31-a8d3-454e-ac8a-337ed41a2379.png",
      "regalo-empresarial": "https://images.hostinger.com/6f63e663-203a-4d3f-b475-389b67fec691.png",
      "kit-corporativo": "https://images.hostinger.com/362db1df-df80-46c7-bbb9-e30be6521c66.png",
      "proyecto-especial": "https://images.hostinger.com/fe28438f-6785-4d04-9bdd-5c215c319083.png",
    };

    for (const [slug, image] of Object.entries(images)) {
      const records = app.findRecordsByFilter("products", `slug = {:slug}`, "", 0, 0, { slug });
      for (const r of records) {
        r.set("image", image);
        app.save(r);
      }
    }
  },
  (app) => {
    const fallback = "https://images.hostinger.com/b951f346-3a73-4fc7-b1e0-fbc291cc5892.png";
    const slugs = [
      "playera-premium-dtf",
      "gorra-bordada",
      "termo-600ml",
      "taza-personalizada",
      "bolsa-tote",
      "regalo-empresarial",
      "kit-corporativo",
      "proyecto-especial",
    ];
    for (const slug of slugs) {
      const records = app.findRecordsByFilter("products", `slug = {:slug}`, "", 0, 0, { slug });
      for (const r of records) {
        r.set("image", fallback);
        app.save(r);
      }
    }
  },
);
