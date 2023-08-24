/**
 * From:
 * https://stackoverflow.com/questions/57683303/how-can-i-see-the-full-expanded-contract-of-a-typescript-type
 */
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;
