import type { InviteDurableObject } from "./inviteObject";
import type { RoomDurableObject } from "./roomObject";

export interface Env {
  /** One Durable Object per room, addressed by room code. */
  ROOMS: DurableObjectNamespace<RoomDurableObject>;
  /** One Durable Object per invite label: quotas, "My rooms" and lazy expiry. */
  INVITES: DurableObjectNamespace<InviteDurableObject>;
  /** Secret: signs room codes so made-up codes are rejected before reaching a Durable Object. */
  ROOM_CODE_SECRET?: string;
  /** Secret: `label:key` pairs, comma- or newline-separated. See README → Invites. */
  INVITE_CODES?: string;
  /** Kill switch: set to "false" to turn off online rooms (solo mode keeps working). */
  ONLINE_ENABLED?: string;
  /** Local development only: "true" lets the debug console reveal hidden information in online rooms. */
  DEV_CHEATS?: string;
}

export const OFFLINE_MESSAGE = "Online rooms are turned off right now. Solo mode still works!";

export function onlineEnabled(env: Env): boolean {
  return env.ONLINE_ENABLED?.trim().toLowerCase() !== "false";
}

export function cheatsEnabled(env: Env): boolean {
  return env.DEV_CHEATS?.trim().toLowerCase() === "true";
}

export function inviteStub(env: Env, label: string) {
  return env.INVITES.get(env.INVITES.idFromName(`invite:${label}`));
}

export function roomStub(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}
