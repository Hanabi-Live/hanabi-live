// The title of a screen in the lobby. Every screen uses it, so that the titles look the same.

/** The size of a title. A screen that puts its title in a row of other elements uses only this. */
export const TITLE_TEXT = "tw:text-[1.75em] tw:leading-tight";

/** The title at the top of a lobby page, such as "Create a New Game". */
export function PageTitle({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return <h2 className={`tw:mt-0 tw:mb-[0.6em] ${TITLE_TEXT}`}>{children}</h2>;
}
