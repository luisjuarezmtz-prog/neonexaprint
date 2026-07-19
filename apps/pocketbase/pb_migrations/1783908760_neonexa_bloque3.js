/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const adminWrite = "@request.auth.id != '' && @request.auth.role = 'admin'";
    const ownerRead = "@request.auth.id != '' && (@request.auth.id = owner || @request.auth.role = 'admin')";
    const ownerCreate = "@request.auth.id != '' && @request.auth.id = @request.body.owner";

    const TOOLS = [
      "inspector", "calculadora", "gang-sheet", "background-remover", "upscaler",
      "vectorizer", "transparency-cleaner", "halftone-smart", "shirt-simulator", "rip-preparer",
    ];

    const ownerField = { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true };
    const dates = [
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ];

    const create = (name, def) => {
      try { return app.findCollectionByNameOrId(name); } catch (_) {
        const c = new Collection(Object.assign({ type: "base", name }, def));
        app.save(c);
        return app.findCollectionByNameOrId(name);
      }
    };

    // --- tool_jobs (per-user job history) ---
    create("tool_jobs", {
      listRule: ownerRead, viewRule: ownerRead, createRule: ownerCreate,
      updateRule: ownerRead, deleteRule: ownerRead,
      fields: [
        { name: "tool", type: "select", required: true, maxSelect: 1, values: TOOLS },
        { name: "title", type: "text", max: 200 },
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["queued", "processing", "done", "error"] },
        { name: "input_name", type: "text", max: 300 },
        { name: "input_preview", type: "text", max: 3000000 },
        { name: "output_preview", type: "text", max: 3000000 },
        { name: "params", type: "json", maxSize: 200000 },
        { name: "result", type: "json", maxSize: 200000 },
        { name: "error", type: "text", max: 2000 },
        ownerField,
        ...dates,
      ],
      indexes: ["CREATE INDEX idx_tool_jobs_owner ON tool_jobs (owner)"],
    });

    // --- tool_limits (admin-configurable, public read) ---
    create("tool_limits", {
      listRule: "", viewRule: "", createRule: adminWrite, updateRule: adminWrite, deleteRule: adminWrite,
      fields: [
        { name: "tool", type: "select", required: true, maxSelect: 1, values: TOOLS },
        { name: "plan_name", type: "text", max: 120 },
        { name: "monthly_limit", type: "number" },
        { name: "enabled", type: "bool" },
        { name: "note", type: "text", max: 300 },
        ...dates,
      ],
      indexes: ["CREATE INDEX idx_tool_limits_tool ON tool_limits (tool)"],
    });

    // --- tool_usage_logs (consumption) ---
    create("tool_usage_logs", {
      listRule: ownerRead, viewRule: ownerRead, createRule: ownerCreate,
      updateRule: adminWrite, deleteRule: adminWrite,
      fields: [
        { name: "tool", type: "select", required: true, maxSelect: 1, values: TOOLS },
        { name: "action", type: "text", max: 60 },
        { name: "meta", type: "json", maxSize: 50000 },
        ownerField,
        ...dates,
      ],
      indexes: ["CREATE INDEX idx_tool_usage_owner ON tool_usage_logs (owner)"],
    });

    // --- tool_errors ---
    create("tool_errors", {
      listRule: ownerRead, viewRule: ownerRead, createRule: ownerCreate,
      updateRule: adminWrite, deleteRule: adminWrite,
      fields: [
        { name: "tool", type: "select", maxSelect: 1, values: TOOLS },
        { name: "message", type: "text", max: 2000 },
        { name: "stack", type: "text", max: 6000 },
        { name: "meta", type: "json", maxSize: 50000 },
        ownerField,
        ...dates,
      ],
    });

    // --- seed default tool limits (per plan) ---
    const limitCol = app.findCollectionByNameOrId("tool_limits");
    const plans = ["Neonexa Tools Mensual", "Neonexa Tools Anual"];
    for (const tool of TOOLS) {
      for (const plan of plans) {
        try { app.findFirstRecordByFilter("tool_limits", "tool = {:t} && plan_name = {:p}", { t: tool, p: plan }); }
        catch (_) {
          const r = new Record(limitCol);
          r.set("tool", tool);
          r.set("plan_name", plan);
          r.set("monthly_limit", plan.includes("Anual") ? -1 : 100);
          r.set("enabled", true);
          app.save(r);
        }
      }
    }
  },
  (app) => {
    for (const name of ["tool_errors", "tool_usage_logs", "tool_limits", "tool_jobs"]) {
      try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
    }
  },
);
