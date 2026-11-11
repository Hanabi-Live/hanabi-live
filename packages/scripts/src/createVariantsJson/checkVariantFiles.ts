import { isFile, readFile } from "./completeNode.ts";
import { generateVariantFiles } from "./createVariantsJson.ts";

await checkVariantFiles();

async function checkVariantFiles() {
  const files = await generateVariantFiles();

  const exists = await isFile(files.variantsPath);
  if (!exists) {
    throw new Error(
      `Failed to find the "variants.json" file at: ${files.variantsPath}`,
    );
  }

  // Compare the text file first since the diff will be cleaner.
  if ((await readFile(files.textPath)) !== files.variantsText) {
    throw new Error(
      'The "variants.txt" file is not up to date. Run: bun run create-variants-json',
    );
  }

  if ((await readFile(files.variantsPath)) !== files.variantsJson) {
    throw new Error(
      'The "variants.json" file is not up to date. Run: bun run create-variants-json',
    );
  }
}
