export interface Row<S extends string> {
  from: readonly S[];
  to: S | 'same' | readonly S[];
}
