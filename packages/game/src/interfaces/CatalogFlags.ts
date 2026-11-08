/**
 * Every property of a catalog entry, with its default applied. The catalog sets each flag to true
 * or omits it, so a flag becomes a boolean.
 */
export type CatalogFlags<T> = {
  readonly [Key in keyof T]-?: [Exclude<T[Key], undefined>] extends [true]
    ? boolean
    : Exclude<T[Key], undefined>;
};
