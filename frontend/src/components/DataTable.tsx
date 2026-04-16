import type { ReactNode } from "react";

type DataTableProps = {
  headers: string[];
  rows: ReactNode[][];
};

export function DataTable({ headers, rows }: DataTableProps) {
  if (!rows.length) {
    return <div className="empty">No data yet</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${headers.join("-")}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

