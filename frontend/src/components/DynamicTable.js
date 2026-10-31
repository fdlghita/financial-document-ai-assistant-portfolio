import React from 'react';

const DynamicTable = ({ data }) => {
  if (!data) return null;

  // KPI Summary format: { type: "kpi_summary", columns: [...], rows: [{...}] }
  if (data.type === "kpi_summary") {
    const { columns, rows } = data;
    if (!columns || !rows || rows.length === 0) return null;
    return (
      <div className="mt-4 overflow-x-auto rounded-lg shadow-md">
        <table className="min-w-full border-collapse bg-white text-sm">
          <thead className="bg-brand-navy-dark text-white">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {columns.map((col) => (
                  <td
                    key={col}
                    className="whitespace-nowrap px-4 py-3 text-sm text-gray-800 font-medium"
                  >
                    {row[col] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Translation format: [{key, original_key, value}]
  if (!Array.isArray(data) || data.length === 0) return null;
  return (
    <div className="mt-6 overflow-x-auto rounded-lg shadow-md">
      <table className="min-w-full border-collapse bg-white">
        <thead className="bg-blue-800 text-white">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider">
              Terme Financier (Traduit)
            </th>
            <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider">
              Terme Original (Français)
            </th>
            <th className="px-6 py-3 text-left text-xs font-bold uppercase tracking-wider">
              Valeur
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {data.map((item, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                {item.key}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                {item.original_key}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                {item.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DynamicTable;
