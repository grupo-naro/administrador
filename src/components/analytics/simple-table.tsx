export function SimpleTable({
  headers,
  rows,
  empty = "Sin datos para este período.",
}: {
  headers: { label: string; right?: boolean }[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left">
          <tr>
            {headers.map((h) => (
              <th key={h.label} className={`p-2 font-medium ${h.right ? "text-right" : ""}`}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} className="p-3 text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((cells, r) => (
            <tr key={r} className="border-t">
              {cells.map((cell, c) => (
                <td key={c} className={`p-2 ${headers[c]?.right ? "text-right" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
