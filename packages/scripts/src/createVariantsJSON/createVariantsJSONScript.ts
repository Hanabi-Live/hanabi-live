import { createVariantsJSON } from "./createVariantsJSON";

main().catch((error: unknown) => {
  throw new Error(`${error}`);
});

async function main() {
  await createVariantsJSON(false);
}
