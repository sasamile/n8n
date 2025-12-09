"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { openaiChannel } from "@/inngest/channels/openai";

export type OpenAiToken = Realtime.Token<typeof openaiChannel, ["status"]>;

export async function fetchOpenAiRealtimeToken(): Promise<OpenAiToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: openaiChannel(),
    topics: ["status"],
  });

  return token;
}
