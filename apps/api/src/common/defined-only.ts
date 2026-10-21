/**
 * Returns a copy of a (DTO) object without keys whose value is `undefined`.
 *
 * class-transformer instances declare every property, so `Object.assign(doc, dto)` or `{ $set: dto }`
 * would otherwise overwrite fields the client did not send with `undefined` (wiping data or failing
 * required-field validation). PATCH handlers must only apply what was actually provided.
 */
export function definedOnly<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
