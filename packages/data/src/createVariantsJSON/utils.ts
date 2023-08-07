export function error(message: string): never {
  console.error(message);
  process.exit(1);
}
