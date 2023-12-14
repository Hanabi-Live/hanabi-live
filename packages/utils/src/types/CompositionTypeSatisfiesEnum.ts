/**
 * Helper type to validate that a union of interfaces with a field of `type` that is based on an
 * enum is complete.
 *
 * For example:
 *
 * ```ts
 * enum ObjectiveType {
 *   FOO,
 *   BAR,
 *   BAZ,
 * }
 *
 * interface FooObjective {
 *   type: ObjectiveType.FOO;
 *   fooThing: number;
 * }
 *
 * interface BarObjective {
 *   type: ObjectiveType.BAR;
 *   barThing: string;
 * }
 *
 * type Objective = FooObjective | BarObjective;
 * type _Test = CompositionTypeSatisfiesEnum<Objective, ObjectiveType>;
 * ```
 *
 * In this example, `Test` would be flagged by TypeScript because `Objective` does not contain an
 * entry for `BazObjective`.
 */
export type CompositionTypeSatisfiesEnum<
  T extends { type: unknown },
  _Enum extends T["type"],
> = unknown;
