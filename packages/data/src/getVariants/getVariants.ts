import { VariantDescription } from "../types/VariantDescription";

export function getBasicVariants(
  variantSuits: string[][],
): VariantDescription[] {
  return [
    {
      name: "No Variant",
      suits: variantSuits[5],
    },
    {
      name: "6 Suits",
      suits: variantSuits[6],
    },
    {
      name: "4 Suits",
      suits: variantSuits[4],
    },
    {
      name: "3 Suits",
      suits: variantSuits[3],
    },
  ];
}
