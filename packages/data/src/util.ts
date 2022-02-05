export const ensureAllCases = (obj: never): never => obj;

export function error(message: string): never {
  console.error(message);
  process.exit(1);
}
