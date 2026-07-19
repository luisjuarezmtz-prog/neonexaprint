/// <reference path="../pb_data/types.d.ts" />

// Adds the two missing roles from the client spec (Operador de producción,
// Ventas/Atención) and extends read/write access on the collections staff
// actually need to do their job, without giving them admin-only collections
// (products, pricing, memberships, notification config, tool limits).

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const roleField = users.fields.getByName("role");
    if (roleField) {
        roleField.values = ["member", "admin", "operador", "ventas"];
    }
    // ventas needs to look up customer contact info; operador doesn't.
    users.listRule = "id = @request.auth.id || @request.auth.role = 'admin' || @request.auth.role = 'ventas'";
    users.viewRule = "id = @request.auth.id || @request.auth.role = 'admin' || @request.auth.role = 'ventas'";
    app.save(users);

    const staffRead = "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin' || @request.auth.role = 'operador' || @request.auth.role = 'ventas')";
    const staffWrite = "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin' || @request.auth.role = 'operador' || @request.auth.role = 'ventas')";

    // orders: both roles need to see every order and progress it (status,
    // shipping notes, etc.) — that's the shared "Pedidos" work queue.
    const orders = app.findCollectionByNameOrId("orders");
    orders.listRule = staffRead;
    orders.viewRule = staffRead;
    orders.updateRule = staffWrite;
    app.save(orders);

    // payments: staff can see payment status for context (needed to know if
    // an order is safe to produce/ship), but only admin corrects it manually.
    const payments = app.findCollectionByNameOrId("payments");
    payments.listRule = staffRead;
    payments.viewRule = staffRead;
    app.save(payments);

    // files: operador needs the uploaded design to produce it; ventas may
    // need it to answer a customer question.
    const files = app.findCollectionByNameOrId("files");
    files.listRule = staffRead;
    files.viewRule = staffRead;
    app.save(files);

    // production_events: both roles log/see production history on an order.
    const productionEvents = app.findCollectionByNameOrId("production_events");
    productionEvents.listRule = staffRead;
    productionEvents.viewRule = staffRead;
    app.save(productionEvents);
  },
  (app) => {
    const adminOnly = "@request.auth.id != '' && @request.auth.role = 'admin'";
    const ownerRead = "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')";

    for (const [name, listView, update] of [
      ["orders", ownerRead, ownerRead],
      ["payments", ownerRead, adminOnly],
      ["files", ownerRead, ownerRead],
      ["production_events", ownerRead, adminOnly],
    ]) {
      try {
        const col = app.findCollectionByNameOrId(name);
        col.listRule = listView;
        col.viewRule = listView;
        if (name === "orders" || name === "files") col.updateRule = update;
        app.save(col);
      } catch (_) {}
    }

    try {
      const users = app.findCollectionByNameOrId("users");
      const roleField = users.fields.getByName("role");
      if (roleField) roleField.values = ["member", "admin"];
      users.listRule = "id = @request.auth.id || @request.auth.role = 'admin'";
      users.viewRule = "id = @request.auth.id || @request.auth.role = 'admin'";
      app.save(users);
    } catch (_) {}
  },
);
