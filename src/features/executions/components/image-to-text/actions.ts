"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { imageToTextChannel } from "@/inngest/channels/image-to-text";

export type ImageToTextToken = Realtime.Token<typeof imageToTextChannel, ["status"]>;

export async function fetchImageToTextRealtimeToken(): Promise<ImageToTextToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: imageToTextChannel(),
    topics: ["status"],
  });

  return token;
}






