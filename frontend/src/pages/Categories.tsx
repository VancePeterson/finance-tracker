import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { DEFAULT_COLOR_PALETTE } from "../lib/format";
import type { Category, Rule } from "../types";

export default function Categories() {
  const qc = useQueryClient();
  const categoriesQ = useQuery({ queryKey: ["categories"], queryFn: () => api.categories.list() });
  const rulesQ = useQuery({ queryKey: ["rules"], queryFn: () => api.rules.list() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["rules"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const createCategory = useMutation({
    mutationFn: (b: { name: string; color: string }) => api.categories.create(b),
    onSuccess: invalidate,
  });
  const updateCategory = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Category> }) =>
      api.categories.update(id, body),
    onSuccess: invalidate,
  });
  const deleteCategory = useMutation({
    mutationFn: (id: number) => api.categories.delete(id),
    onSuccess: invalidate,
  });

  const createRule = useMutation({
    mutationFn: (b: { pattern: string; category_id: number; priority?: number }) =>
      api.rules.create(b),
    onSuccess: invalidate,
  });
  const updateRule = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Rule> }) => api.rules.update(id, body),
    onSuccess: invalidate,
  });
  const deleteRule = useMutation({
    mutationFn: (id: number) => api.rules.delete(id),
    onSuccess: invalidate,
  });
  const reapplyRules = useMutation({
    mutationFn: () => api.rules.apply(),
    onSuccess: invalidate,
  });

  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(DEFAULT_COLOR_PALETTE[0]);

  const [newPattern, setNewPattern] = useState("");
  const [newRuleCat, setNewRuleCat] = useState<number | "">("");

  return (
    <>
      <h2>Categories &amp; Rules</h2>

      <div className="grid grid-2-col" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <h3>Categories</h3>
          <div className="row" style={{ marginBottom: 12 }}>
            <input
              placeholder="New category name"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              type="color"
              value={newCatColor}
              onChange={(e) => setNewCatColor(e.target.value)}
              style={{ width: 50, padding: 0 }}
            />
            <button
              className="primary"
              disabled={!newCatName}
              onClick={() => {
                createCategory.mutate(
                  { name: newCatName, color: newCatColor },
                  { onSuccess: () => setNewCatName("") },
                );
              }}
            >
              add
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Color</th>
                  <th className="right">Txns</th>
                  <th title="Include in reports/charts">Reports</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(categoriesQ.data ?? []).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input
                        defaultValue={c.name}
                        onBlur={(e) => {
                          if (e.target.value !== c.name)
                            updateCategory.mutate({ id: c.id, body: { name: e.target.value } });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="color"
                        defaultValue={c.color ?? "#888888"}
                        onBlur={(e) =>
                          updateCategory.mutate({ id: c.id, body: { color: e.target.value } })
                        }
                        style={{ width: 50, padding: 0 }}
                      />
                    </td>
                    <td className="amount">{c.transaction_count}</td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={!c.excluded_from_reports}
                        onChange={(e) =>
                          updateCategory.mutate({
                            id: c.id,
                            body: { excluded_from_reports: !e.target.checked },
                          })
                        }
                        title={c.excluded_from_reports ? "Excluded from reports" : "Included in reports"}
                      />
                    </td>
                    <td>
                      <button
                        className="danger"
                        onClick={() => {
                          if (confirm(`Delete "${c.name}"? Rules will also be deleted.`))
                            deleteCategory.mutate(c.id);
                        }}
                      >
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="row between">
            <h3 style={{ margin: 0 }}>Merchant rules</h3>
            <button onClick={() => reapplyRules.mutate()} disabled={reapplyRules.isPending}>
              {reapplyRules.isPending ? "applying…" : "re-apply all"}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Patterns use SQL <code>LIKE</code>. Use <code>%</code> as a wildcard
            (e.g. <code>%Mellow Mushroom%</code>). Higher priority rules apply first.
            Manually-set categories are never overridden.
          </p>
          <div className="row" style={{ marginBottom: 12 }}>
            <input
              placeholder="Pattern (e.g. %McDonald%)"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              style={{ flex: 1 }}
            />
            <select
              value={newRuleCat}
              onChange={(e) => setNewRuleCat(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">— category —</option>
              {(categoriesQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              className="primary"
              disabled={!newPattern || newRuleCat === ""}
              onClick={() => {
                createRule.mutate(
                  { pattern: newPattern, category_id: newRuleCat as number },
                  { onSuccess: () => setNewPattern("") },
                );
              }}
            >
              add
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pattern</th>
                  <th>Category</th>
                  <th className="right">Priority</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(rulesQ.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        defaultValue={r.pattern}
                        onBlur={(e) => {
                          if (e.target.value !== r.pattern)
                            updateRule.mutate({ id: r.id, body: { pattern: e.target.value } });
                        }}
                        style={{ width: "100%" }}
                      />
                    </td>
                    <td>
                      <select
                        defaultValue={r.category_id}
                        onChange={(e) =>
                          updateRule.mutate({
                            id: r.id,
                            body: { category_id: Number(e.target.value) },
                          })
                        }
                      >
                        {(categoriesQ.data ?? []).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        defaultValue={r.priority}
                        onBlur={(e) =>
                          updateRule.mutate({
                            id: r.id,
                            body: { priority: Number(e.target.value) },
                          })
                        }
                        style={{ width: 60, textAlign: "right" }}
                      />
                    </td>
                    <td>
                      <button
                        className="danger"
                        onClick={() => deleteRule.mutate(r.id)}
                      >
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
