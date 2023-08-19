export type DeepReadonly<T> = [
  { readonly [k in keyof T]: DeepReadonly<T[k]> },
][0];
