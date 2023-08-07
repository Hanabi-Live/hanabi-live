import { ReadonlySet } from "@hanabi/utils";

const TEST_USERNAMES = new ReadonlySet([
  "test",
  "test1",
  "test2",
  "test3",
  "test4",
  "test5",
  "test6",
]);

export function amTestUser(username: string): boolean {
  return TEST_USERNAMES.has(username);
}
