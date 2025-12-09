"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { botRouterChannel } from "@/inngest/channels/bot-router";

export type BotRouterToken = Realtime.Token<typeof botRouterChannel, ["status"]>;

export async function fetchBotRouterRealtimeToken(): Promise<BotRouterToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: botRouterChannel(),
    topics: ["status"],
  });

  return token;
}

