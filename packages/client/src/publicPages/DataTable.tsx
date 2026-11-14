// The tables of the server's public pages: headers that sort the table, a row of filters, and a
// pager above and below the table.

import { PAGE_SIZES } from "@hanabi-live/data";
import { useEffect, useRef, useState } from "react";

/** How long to wait after the last keystroke in a filter box before applying it. */
const FILTER_DELAY_MILLISECONDS = 300;

/** The page size of "All Rows", which only the tables whose rows are all in the page offer. */
const ALL_ROWS = Infinity;

interface Choice {
  readonly value: string;
  readonly text: string;
}

export interface Column {
  readonly header: string;
  readonly sortable: boolean;
  /** No filter, a text box, or a list of choices. */
  readonly filter: "none" | "text" | readonly Choice[];
  /** The classes of the column's header, such as its alignment. */
  readonly className?: string;
  /** The classes of the column's filter cell. */
  readonly filterClassName?: string;
}

export interface Sort {
  readonly column: number;
  readonly descending: boolean;
}

/** Each column's non-empty filter value, by column index. */
export type Filters = ReadonlyMap<number, string>;

/** The sort after a click on a column's header: ascending, or the other way if it is sorted. */
export function nextSort(sort: Sort | undefined, column: number): Sort {
  return {
    column,
    descending: sort?.column === column && !sort.descending,
  };
}

/** The filters with a column's new value, or the same filters if the value did not change. */
export function nextFilters(
  filters: Filters,
  column: number,
  value: string,
): Filters {
  const trimmed = value.trim();
  if ((filters.get(column) ?? "") === trimmed) {
    return filters;
  }
  const next = new Map(filters);
  if (trimmed === "") {
    next.delete(column);
  } else {
    next.set(column, trimmed);
  }
  return next;
}

/** The number of pages that `rows` rows fill, which is at least one. */
function pageCount(rows: number, size: number): number {
  return Math.max(1, Math.ceil(rows / size));
}

/** The first row of a page. */
export function pageStart(page: number, size: number): number {
  return Number.isFinite(size) ? page * size : 0;
}

export function DataTable({
  columns,
  sort,
  onSort,
  onFilter,
  scrollLabel,
  children,
}: {
  readonly columns: readonly Column[];
  readonly sort: Sort | undefined;
  readonly onSort: (column: number) => void;
  readonly onFilter: (column: number, value: string) => void;
  /** The name of the region that scrolls a wide table sideways, if it has one. */
  readonly scrollLabel?: string;
  /** The rows. */
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const table = (
    <table className="tw:mt-8">
      <thead>
        <tr>
          {columns.map((column, index) => (
            <Header
              column={column}
              key={column.header}
              onSort={() => {
                onSort(index);
              }}
              sort={sortState(sort, index)}
            />
          ))}
        </tr>
        {columns.some((column) => column.filter !== "none") && (
          <tr>
            {columns.map((column, index) => (
              <td className={column.filterClassName} key={column.header}>
                <FilterControl
                  filter={column.filter}
                  name={column.header}
                  onChange={(value) => {
                    onFilter(index, value);
                  }}
                />
              </td>
            ))}
          </tr>
        )}
      </thead>
      <tbody>{children}</tbody>
    </table>
  );

  if (scrollLabel === undefined) {
    return table;
  }
  return (
    <div
      aria-label={scrollLabel}
      className="tw:max-w-full tw:overflow-x-auto"
      role="region"
      tabIndex={0}
    >
      {table}
    </div>
  );
}

/** How a column is sorted, as its header's "aria-sort" attribute says it. */
function sortState(
  sort: Sort | undefined,
  column: number,
): keyof typeof SORT_ARROWS {
  if (sort?.column !== column) {
    return "none";
  }
  return sort.descending ? "descending" : "ascending";
}

/** The arrows of a sortable header: both of them, or the one that shows the direction. */
const SORT_ARROWS = {
  none: {
    height: 9,
    path: "M7 4h7l-3.5-4zM7 5h7l-3.5 4z",
  },
  ascending: {
    height: 4,
    path: "M7 4h7l-3.5-4z",
  },
  descending: {
    height: 4,
    path: "M7 0h7l-3.5 4z",
  },
} as const;

/** The width of the sort arrows, which leaves room between them and the header's text. */
const SORT_ARROWS_WIDTH = 21;

function Header({
  column,
  sort,
  onSort,
}: {
  readonly column: Column;
  readonly sort: keyof typeof SORT_ARROWS;
  readonly onSort: () => void;
}) {
  if (!column.sortable) {
    return <th className={column.className}>{column.header}</th>;
  }
  const arrows = SORT_ARROWS[sort];
  return (
    <th
      aria-sort={sort}
      className={`tw:relative tw:cursor-pointer tw:whitespace-normal ${sort === "none" ? "" : "tw:bg-table-sorted"} ${column.className ?? ""}`}
      onClick={onSort}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSort();
        }
      }}
      tabIndex={0}
    >
      {column.header}
      {/* The arrows use the header's text color, so that they follow the theme. */}
      <svg
        aria-hidden
        className="tw:absolute tw:top-1/2 tw:right-0 tw:-translate-y-1/2"
        height={arrows.height}
        viewBox={`0 0 ${SORT_ARROWS_WIDTH} ${arrows.height}`}
        width={SORT_ARROWS_WIDTH}
      >
        <path d={arrows.path} fill="currentColor" />
      </svg>
    </th>
  );
}

function FilterControl({
  filter,
  name,
  onChange,
}: {
  readonly filter: Column["filter"];
  readonly name: string;
  readonly onChange: (value: string) => void;
}) {
  if (filter === "none") {
    return null;
  }
  if (filter === "text") {
    return <TextFilter name={name} onChange={onChange} />;
  }
  return (
    <select
      aria-label={`Filter by ${name}`}
      className="tw:h-auto tw:w-auto tw:max-w-[150px] tw:py-0 tw:pr-10 tw:pl-2"
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      <option value="" />
      {filter.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.text}
        </option>
      ))}
    </select>
  );
}

/** A text box that applies its filter once the typing pauses. */
function TextFilter({
  name,
  onChange,
}: {
  readonly name: string;
  readonly onChange: (value: string) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  return (
    <input
      aria-label={`Filter by ${name}`}
      className="tw:h-auto tw:w-[5em] tw:rounded-[var(--radius)] tw:border tw:border-border tw:bg-surface tw:text-inherit"
      onChange={(event) => {
        const { value } = event.target;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          onChange(value);
        }, FILTER_DELAY_MILLISECONDS);
      }}
      type="search"
    />
  );
}

/** The state of a table's pages, and the pagers that change it. */
export function usePages(): {
  readonly page: number;
  readonly size: number;
  readonly setPage: (page: number) => void;
  readonly setSize: (size: number) => void;
} {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  return {
    page,
    size,
    setPage,
    setSize: (newSize) => {
      setSize(newSize);
      setPage(0);
    },
  };
}

/** The page navigation above and below a table. */
export function Pager({
  page,
  size,
  rows,
  summary,
  allRows,
  onPage,
  onSize,
}: {
  /** The current page, counting from 0. */
  readonly page: number;
  readonly size: number;
  readonly rows: number;
  /** What follows the row range, such as the number of rows. */
  readonly summary: string;
  /** Whether the pager offers "All Rows". */
  readonly allRows: boolean;
  readonly onPage: (page: number) => void;
  readonly onSize: (size: number) => void;
}): React.JSX.Element {
  const pages = pageCount(rows, size);
  const start = pageStart(page, size);
  const end = Math.min(rows, start + size);
  function goTo(target: number) {
    onPage(Math.min(Math.max(0, target), pages - 1));
  }
  const select = "tw:mx-2 tw:inline-block tw:h-auto tw:w-auto";

  return (
    <div className="tw:flex tw:items-center tw:justify-center tw:text-[1em]">
      Page:
      <select
        aria-label="Page"
        className={select}
        onChange={(event) => {
          goTo(Number(event.target.value));
        }}
        value={page}
      >
        {Array.from({ length: pages }, (_, index) => (
          <option key={index} value={index}>
            {index + 1}
          </option>
        ))}
      </select>
      <PagerButton
        icon="fa-fast-backward"
        label="First page"
        onClick={() => {
          goTo(0);
        }}
      />
      <PagerButton
        icon="fa-backward"
        label="Previous page"
        onClick={() => {
          goTo(page - 1);
        }}
      />
      <span className="tw:inline-block tw:px-4 tw:font-normal">
        {rows === 0 ? 0 : start + 1} - {end} / {summary}
      </span>
      <PagerButton
        icon="fa-forward"
        label="Next page"
        onClick={() => {
          goTo(page + 1);
        }}
      />
      <PagerButton
        icon="fa-fast-forward"
        label="Last page"
        onClick={() => {
          goTo(pages - 1);
        }}
      />
      <select
        aria-label="Page size"
        className={select}
        onChange={(event) => {
          onSize(
            event.target.value === "all"
              ? ALL_ROWS
              : Number(event.target.value),
          );
        }}
        value={Number.isFinite(size) ? size : "all"}
      >
        {PAGE_SIZES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {allRows && <option value="all">All Rows</option>}
      </select>
    </div>
  );
}

function PagerButton({
  icon,
  label,
  onClick,
}: {
  readonly icon: string;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="tw:mx-2 tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:text-inherit tw:[font:inherit]"
      onClick={onClick}
      type="button"
    >
      <i className={`fas ${icon}`} />
    </button>
  );
}
