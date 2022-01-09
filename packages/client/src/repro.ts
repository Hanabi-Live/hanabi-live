const foo = new Map<string, string>();
let bar: string | null = null;
for (const value of foo.values()) {
  bar = value;
}
console.log(bar);
