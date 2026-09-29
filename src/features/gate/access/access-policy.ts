/** Port: decides whether a (normalized) handle may enter. Adapters live beside it. */
export interface AccessPolicy {
  isAllowed(handle: string): Promise<boolean>
}
