// The tables of the server's public pages: headers that sort the table, a row of filters, and a
// pager above and below the table.

import { PAGE_SIZES } from "@hanabi-live/data";
import { useState } from "react";
import { useDelayedCallback } from "../useDelayedCallback.ts";

/** The page size of "All", which only the tables whose rows are all in the page offer. */
const ALL_ROWS = Infinity;

/** The value of the "All" choice of page sizes. */
const ALL_ROWS_VALUE = "all";

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
    <table className="tw:mt-2">
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
      className={`tw:relative tw:cursor-pointer tw:whitespace-normal ${sort === "none" ? "" : "tw:font-bold tw:text-text"} ${column.className ?? ""}`}
      onClick={onSort}
      onKeyDown={(event) => {
        if (!(event.key === "Enter" || event.key === " ")) {
          return;
        }

        event.preventDefault();
        onSort();
      }}
      tabIndex={0}
    >
      {/* The sorted column's header is bold, and its arrow shows the direction. */}
      {column.header}
      {/* The arrows use the header's text color. */}
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
  const applyLater = useDelayedCallback(onChange);
  return (
    <input
      aria-label={`Filter by ${name}`}
      className="tw:h-auto tw:w-[5em] tw:rounded-[var(--radius)] tw:border tw:border-border tw:bg-surface tw:text-inherit"
      onChange={(event) => {
        applyLater(event.target.value);
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

/** What a count calls one row and several, such as "game" and "games". */
export type Noun = readonly [one: string, other: string];

/**
 * The count of rows, and the controls that move between pages when there are more than fit on the
 * smallest page.
 */
export function Pages({
  page,
  size,
  total,
  unfiltered,
  noun,
  allRows = false,
  onPage,
  onSize,
}: {
  /** The current page, counting from 0. */
  readonly page: number;
  readonly size: number;
  /** The number of rows that the filters keep. */
  readonly total: number;
  /** The number of rows before the filters, which shows when the filters leave some out. */
  readonly unfiltered?: number;
  readonly noun: Noun;
  /**
   * Whether the page sizes include "All", which only the tables whose rows are all in the page
   * offer.
   */
  readonly allRows?: boolean;
  readonly onPage: (page: number) => void;
  readonly onSize: (size: number) => void;
}): React.JSX.Element | null {
  // The list says when it has no rows.
  if (total === 0) {
    return null;
  }
  const [one, other] = noun;
  const inAll =
    unfiltered === undefined || unfiltered === total
      ? ""
      : ` (${unfiltered} in all)`;
  if (total <= PAGE_SIZES[0]) {
    return (
      <p className="tw:mt-4 tw:mb-0 tw:text-center tw:text-[0.9em] tw:text-text-label">
        {total} {total === 1 ? one : other}
        {inAll}
      </p>
    );
  }
  const pages = pageCount(total, size);
  const start = pageStart(page, size);
  const end = Math.min(total, start + size);
  const arrow =
    "tw:h-8 tw:w-8 tw:cursor-pointer tw:rounded-[var(--radius)] tw:border tw:border-solid tw:border-border tw:bg-surface-sunken tw:p-0 tw:text-inherit tw:enabled:hover:border-text-label tw:disabled:cursor-default tw:disabled:opacity-40";
  return (
    <div className="tw:mt-4 tw:flex tw:flex-wrap tw:items-center tw:justify-center tw:gap-3 tw:text-[0.9em]">
      <button
        aria-label="Previous page"
        className={arrow}
        disabled={page === 0}
        onClick={() => {
          onPage(page - 1);
        }}
        type="button"
      >
        <i className="fas fa-chevron-left" />
      </button>
      <span className="tw:tabular-nums">
        {start + 1}-{end} of {total}
        {inAll}
      </span>
      <button
        aria-label="Next page"
        className={arrow}
        disabled={page >= pages - 1}
        onClick={() => {
          onPage(page + 1);
        }}
        type="button"
      >
        <i className="fas fa-chevron-right" />
      </button>
      <select
        aria-label={`${other.charAt(0).toUpperCase()}${other.slice(1)} per page`}
        className="tw:ml-4 tw:h-8 tw:w-auto tw:py-0 tw:pr-10 tw:pl-3 tw:text-[1em] tw:leading-8"
        onChange={(event) => {
          onSize(
            event.target.value === ALL_ROWS_VALUE
              ? ALL_ROWS
              : Number(event.target.value),
          );
        }}
        value={Number.isFinite(size) ? size : ALL_ROWS_VALUE}
      >
        {PAGE_SIZES.map((option) => (
          <option key={option} value={option}>
            {option} per page
          </option>
        ))}
        {allRows && <option value={ALL_ROWS_VALUE}>All</option>}
      </select>
    </div>
  );
}
