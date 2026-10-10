/** WebSocket close codes the server uses. Any 4xxx close is final: the client doesn't retry. */
export const CLOSE = {
  refused: 4403,
  notFound: 4404,
  claim: 4409,
  deleted: 4410,
  /** Closed for flooding the room with messages. */
  flood: 4429,
  offline: 4503,
} as const;
