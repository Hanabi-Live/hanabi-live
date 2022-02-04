export function getNextUnusedVariantID(
  variantName: string,
  lastUsedVariantID: number,
  oldVariantsNameToIDMap: Map<string, number>,
  oldVariantsIDToNameMap: Map<number, string>,
): number {
  // First, prefer the old/existing variant ID, if present
  const id = oldVariantsNameToIDMap.get(variantName);
  if (id !== undefined) {
    return id;
  }

  // Otherwise, find the lowest unused variant ID
  let foundUnusedVariantID = false;
  let variantID = lastUsedVariantID;
  do {
    variantID += 1;
    const existingVariantName = oldVariantsIDToNameMap.get(variantID);
    if (existingVariantName === undefined) {
      foundUnusedVariantID = true;
    }
  } while (!foundUnusedVariantID);

  return variantID;
}
