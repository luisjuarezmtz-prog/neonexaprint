/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    let demo;
    try {
      demo = app.findAuthRecordByEmail("users", "test@neonexa.com");
    } catch (_) {
      demo = new Record(users);
      demo.setEmail("test@neonexa.com");
    }
    demo.setPassword("Password123!");
    demo.set("name", "Cliente Demo");
    demo.set("role", "member");
    demo.set("verified", true);
    app.save(demo);
  },
  (app) => {
    try {
      const demo = app.findAuthRecordByEmail("users", "test@neonexa.com");
      app.delete(demo);
    } catch (_) {}
  },
);
