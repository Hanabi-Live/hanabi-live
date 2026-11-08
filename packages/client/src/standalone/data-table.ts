// Sort headers, a filter row, and pagers for the tables on the server's public pages.

import { DEFAULT_PAGE_SIZE } from "@hanabi-live/data";

/** How long to wait after the last keystroke in a filter box before applying it. */
const FILTER_DELAY_MILLISECONDS = 300;

export interface Choice {
  readonly value: string;
  readonly text: string;
}

export interface Column {
  readonly sortable: boolean;
  /** No filter, a text box, or a list of choices. */
  readonly filter: "none" | "text" | readonly Choice[];
}

export interface Sort {
  readonly column: number;
  readonly descending: boolean;
}

export interface TableControls {
  readonly sort: () => Sort | undefined;
  /** Each column's non-empty filter value, by column index. */
  readonly filters: () => ReadonlyMap<number, string>;
}

/**
 * Makes the sortable headers clickable and adds a row of filters below them. `onChange` runs after
 * each change to the sort or the filters.
 */
export function addTableControls(
  table: HTMLTableElement,
  columns: readonly Column[],
  initialSort: Sort | undefined,
  onChange: () => void,
): TableControls {
  const headers = [...(table.tHead?.rows[0]?.cells ?? [])];
  let sort = initialSort;
  const filters = new Map<number, string>();

  function drawSort() {
    for (const [index, header] of headers.entries()) {
      if (index === sort?.column) {
        header.setAttribute(
          "aria-sort",
          sort.descending ? "descending" : "ascending",
        );
      } else if (columns[index]?.sortable === true) {
        header.setAttribute("aria-sort", "none");
      }
    }
  }

  function sortBy(column: number) {
    sort = {
      column,
      descending: sort?.column === column && !sort.descending,
    };
    drawSort();
    onChange();
  }

  for (const [index, header] of headers.entries()) {
    if (columns[index]?.sortable !== true) {
      continue;
    }
    header.dataset["sortable"] = "";
    header.tabIndex = 0;
    header.addEventListener("click", () => {
      sortBy(index);
    });
    header.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        sortBy(index);
      }
    });
  }
  drawSort();

  function setFilter(column: number, value: string) {
    const trimmed = value.trim();
    if ((filters.get(column) ?? "") === trimmed) {
      return;
    }
    if (trimmed === "") {
      filters.delete(column);
    } else {
      filters.set(column, trimmed);
    }
    onChange();
  }

  if (columns.some((column) => column.filter !== "none")) {
    const row = document.createElement("tr");
    row.className = "table-filters";
    for (const [index, header] of headers.entries()) {
      const cell = document.createElement("td");
      const control = filterControl(
        columns[index]?.filter ?? "none",
        header.textContent.trim(),
        (value) => {
          setFilter(index, value);
        },
      );
      if (control !== undefined) {
        cell.append(control);
      }
      row.append(cell);
    }
    table.tHead?.append(row);
  }

  return {
    sort: () => sort,
    filters: () => filters,
  };
}

function filterControl(
  filter: Column["filter"],
  name: string,
  onInput: (value: string) => void,
): HTMLElement | undefined {
  if (filter === "none") {
    return undefined;
  }
  if (filter === "text") {
    const input = document.createElement("input");
    input.type = "search";
    input.ariaLabel = `Filter by ${name}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        onInput(input.value);
      }, FILTER_DELAY_MILLISECONDS);
    });
    return input;
  }
  const select = document.createElement("select");
  select.ariaLabel = `Filter by ${name}`;
  select.add(new Option("", ""));
  for (const choice of filter) {
    select.add(new Option(choice.text, choice.value));
  }
  select.addEventListener("change", () => {
    onInput(select.value);
  });
  return select;
}

/** The page navigation above and below a table, from the ".pager" elements on the page. */
export class Pagers {
  /** The current page, counting from 0. */
  page = 0;
  /** The number of rows on each page, which is infinite for "All Rows". */
  size: number;
  private readonly pagers: readonly HTMLElement[];

  constructor(onChange: () => void) {
    this.pagers = [...document.querySelectorAll<HTMLElement>(".pager")];
    this.size = pageSize(
      this.pagers[0]?.querySelector<HTMLSelectElement>(".pagesize")?.value,
    );

    const goTo = (page: number) => {
      this.page = page;
      onChange();
    };
    for (const pager of this.pagers) {
      on(pager, ".first", "click", () => {
        goTo(0);
      });
      on(pager, ".prev", "click", () => {
        goTo(this.page - 1);
      });
      on(pager, ".next", "click", () => {
        goTo(this.page + 1);
      });
      on(pager, ".last", "click", () => {
        goTo(Infinity);
      });
      on(pager, ".gotoPage", "change", (element) => {
        goTo(Number((element as HTMLSelectElement).value));
      });
      on(pager, ".pagesize", "change", (element) => {
        this.size = pageSize((element as HTMLSelectElement).value);
        goTo(0);
      });
    }
  }

  /** Clamps the current page to the pages that `rows` rows fill, and returns its first row. */
  start(rows: number): number {
    const last = Math.max(0, Math.ceil(rows / this.size) - 1);
    this.page = Math.min(Math.max(0, this.page), last);
    return Number.isFinite(this.size) ? this.page * this.size : 0;
  }

  /** Shows the current page, of `rows` rows, with `summary` after its row range. */
  draw(rows: number, summary: string): void {
    const start = this.start(rows);
    const end = Math.min(rows, start + this.size);
    const pages = Math.max(1, Math.ceil(rows / this.size));
    for (const pager of this.pagers) {
      const display = pager.querySelector(".pagedisplay");
      if (display !== null) {
        display.textContent = `${rows === 0 ? 0 : start + 1} - ${end} / ${summary}`;
      }
      const select = pager.querySelector<HTMLSelectElement>(".gotoPage");
      if (select !== null) {
        select.replaceChildren(
          ...Array.from(
            { length: pages },
            (_, page) => new Option(String(page + 1), String(page)),
          ),
        );
        select.value = String(this.page);
      }
      const size = pager.querySelector<HTMLSelectElement>(".pagesize");
      if (size !== null) {
        size.value = Number.isFinite(this.size) ? String(this.size) : "all";
      }
    }
  }
}

function pageSize(value: string | undefined): number {
  return value === "all" ? Infinity : Number(value ?? DEFAULT_PAGE_SIZE);
}

function on(
  parent: HTMLElement,
  selector: string,
  type: string,
  listener: (element: Element) => void,
) {
  const element = parent.querySelector(selector);
  element?.addEventListener(type, () => {
    listener(element);
  });
}
