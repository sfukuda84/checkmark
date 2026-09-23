import { TRADEMARK_CLASSES } from "@app/trademark";

/** 区分の選択（FR-005、FR-006）。何も選ばなければ全区分。 */
export function ClassPicker({ selected }: { selected: number[] }) {
  const chosen = new Set(selected);
  return (
    <fieldset className="class-picker">
      <legend>商標の区分（任意）</legend>
      <p className="muted">
        使う予定の商品・サービスの区分を選ぶと、その区分の商標だけで照合します。選ばなければ全区分で照合します。
      </p>
      <details open={selected.length > 0}>
        <summary>区分の一覧と説明を開く</summary>
        {(["goods", "services"] as const).map((kind) => (
          <div key={kind}>
            <h3>{kind === "goods" ? "商品（第 1 類〜第 34 類）" : "サービス（第 35 類〜第 45 類）"}</h3>
            <ul className="class-list">
              {TRADEMARK_CLASSES.filter((c) => c.kind === kind).map((c) => (
                <li key={c.number}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      name="classes"
                      value={String(c.number)}
                      defaultChecked={chosen.has(c.number)}
                    />
                    <span>
                      第 {c.number} 類: <span className="muted">{c.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </details>
    </fieldset>
  );
}
