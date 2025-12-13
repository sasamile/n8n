"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { switchChannel } from "@/inngest/channels/switch";

export type SwitchToken = Realtime.Token<typeof switchChannel, ["status"]>;

export async function fetchSwitchRealtimeToken(): Promise<SwitchToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: switchChannel(),
    topics: ["status"],
  });

  return token;
}






