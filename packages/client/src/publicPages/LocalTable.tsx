// A table whose rows are all in the page, so that it sorts, filters, and pages them itself.

import { useState } from "react";
import type { Column, Filters, Sort } from "./DataTable.tsx";
import {
  DataTable,
  nextFilters,
  nextSort,
  Pager,
  pageStart,
  usePages,
} from "./DataTable.tsx";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** A column of a local table. Its filter's choices are the column's values. */
export interface LocalColumn<Row> extends Omit<Column, "filter"> {
  readonly filter: "none" | "text" | "select";
  /** Sorts "score / max" values by their ratio instead of as text. */
  readonly ratio?: boolean;
  /** The text that the column sorts and filters by. */
  readonly text: (row: Row) => string;
  readonly cell: (row: Row) => React.ReactNode;
  /** The classes of the column's cells, if they differ from its header's. */
  readonly cellClassName?: (row: Row) => string;
}

/** The ratio of a "score / max" value, or 0 if it has no maximum. */
function ratio(value: string): number {
  const [score = 0, max = 0] = value.split(" / ").map(Number.parseFloat);
  return max === 0 || Number.isNaN(max) || Number.isNaN(score)
    ? 0
    : score / max;
}

export function LocalTable<Row>({
  columns,
  rows,
  rowKey,
  initialSort,
  scrollLabel,
}: {
  readonly columns: ReadonlyArray<LocalColumn<Row>>;
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly initialSort: Sort | undefined;
  readonly scrollLabel?: string;
}): React.JSX.Element {
  const [sort, setSort] = useState(initialSort);
  const [filters, setFilters] = useState<Filters>(new Map());
  const { page, size, setPage, setSize } = usePages();

  let shown = rows.filter((row) =>
    [...filters].every(([index, value]) => {
      const column = columns[index];
      if (column === undefined) {
        return true;
      }
      const text = column.text(row);
      return column.filter === "text"
        ? text.toLowerCase().includes(value.toLowerCase())
        : collator.compare(text, value) === 0;
    }),
  );
  const sortColumn = sort === undefined ? undefined : columns[sort.column];
  if (sort !== undefined && sortColumn !== undefined) {
    const direction = sort.descending ? -1 : 1;
    shown = shown.toSorted((a, b) => {
      const [first, second] = [sortColumn.text(a), sortColumn.text(b)];
      const order =
        sortColumn.ratio === true
          ? ratio(first) - ratio(second)
          : collator.compare(first, second);
      return direction * order;
    });
  }
  const start = pageStart(page, size);
  const pager = (
    <Pager
      allRows
      onPage={setPage}
      onSize={setSize}
      page={page}
      rows={shown.length}
      size={size}
      summary={`${shown.length} (${rows.length})`}
    />
  );

  return (
    <>
      {pager}
      <DataTable
        columns={columns.map((column) => ({
          ...column,
          filter:
            column.filter === "select"
              ? [...new Set(rows.map((row) => column.text(row)))]
                  .toSorted((a, b) => collator.compare(a, b))
                  .map((value) => ({
                    value,
                    text: value,
                  }))
              : column.filter,
        }))}
        onFilter={(index, value) => {
          const next = nextFilters(filters, index, value);
          if (next !== filters) {
            setFilters(next);
            setPage(0);
          }
        }}
        onSort={(index) => {
          setSort(nextSort(sort, index));
          setPage(0);
        }}
        scrollLabel={scrollLabel}
        sort={sort}
      >
        {shown.slice(start, start + size).map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((column) => (
              <td
                className={column.cellClassName?.(row) ?? column.className}
                key={column.header}
              >
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </DataTable>
      {pager}
    </>
  );
}
