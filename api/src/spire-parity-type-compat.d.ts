// Compatibility typing for existing generated parity route code. Runtime semantics remain native Array.includes.
interface Array<T> {
  includes(searchElement: any, fromIndex?: number): boolean;
}
interface ReadonlyArray<T> {
  includes(searchElement: any, fromIndex?: number): boolean;
}
