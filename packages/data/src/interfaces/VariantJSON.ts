import type { VariantDescription } from "./VariantDescription";

/** This is similar to `Variant`, but it only has primitive types. */
export interface VariantJSON extends Readonly<VariantDescription> {
  /**
   * A number from 0 to N. For example, "No Variant" is variant 0, "6 Suits" is variant 1, and so
   * on. This is a legacy field; we want to transition to using a more descriptive string ID, which
   * will allow for custom user-defined variants.
   */
  readonly id: number;

  /** A string that describes the variant. For example, "No Variant" is `R+Y+G+B+P`. */
  readonly newID: string;
}
