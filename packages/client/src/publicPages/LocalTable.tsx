// A table whose rows are all in the page, so that it sorts and pages them itself.

import { useState } from "react";
import type { Column, Noun, Sort } from "./DataTable.tsx";
import {
  DataTable,
  nextSort,
  Pages,
  pageStart,
  usePages,
} from "./DataTable.tsx";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** A column of a local table. */
export interface LocalColumn<Row> extends Omit<Column, "filter"> {
  /** Sorts "score / max" values by their ratio instead of as text. */
  readonly ratio?: boolean;
  /** The text that the column sorts by. */
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
  emptyText,
  noun,
}: {
  readonly columns: ReadonlyArray<LocalColumn<Row>>;
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly initialSort: Sort | undefined;
  /** What the page shows instead of the table when it has no rows. */
  readonly emptyText: string;
  /** What the count of rows calls one row and several. */
  readonly noun: Noun;
}): React.JSX.Element {
  const [sort, setSort] = useState(initialSort);
  const { page, size, setPage, setSize } = usePages();

  let shown = rows;
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
  if (rows.length === 0) {
    return <p className="tw:text-center">{emptyText}</p>;
  }

  const start = pageStart(page, size);

  return (
    <>
      <DataTable
        columns={columns.map((column) => ({
          ...column,
          filter: "none",
        }))}
        onSort={(index) => {
          setSort(nextSort(sort, index));
          setPage(0);
        }}
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
      <Pages
        allRows
        noun={noun}
        onPage={setPage}
        onSize={setSize}
        page={page}
        size={size}
        total={rows.length}
      />
    </>
  );
}
