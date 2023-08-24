/** From: https://gist.github.com/ryandabler/8b4ff4f36aed47bc09acc03174638468 */
export type Add<A extends number, B extends number> = Length<
  [...BuildTuple<A>, ...BuildTuple<B>]
>;

/** From: https://gist.github.com/ryandabler/8b4ff4f36aed47bc09acc03174638468 */
export type Subtract<A extends number, B extends number> = A extends A
  ? BuildTuple<A> extends [...infer U, ...BuildTuple<B>]
    ? Length<U>
    : never
  : never;

type BuildTuple<L extends number, T extends unknown[] = []> = T extends {
  length: L;
}
  ? T
  : BuildTuple<L, [...T, unknown]>;

type Length<T extends unknown[]> = T extends { length: infer L } ? L : never;
