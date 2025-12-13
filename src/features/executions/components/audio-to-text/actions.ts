"use server";

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { inngest } from "@/inngest/client";
import { audioToTextChannel } from "@/inngest/channels/audio-to-text";

export type AudioToTextToken = Realtime.Token<typeof audioToTextChannel, ["status"]>;

export async function fetchAudioToTextRealtimeToken(): Promise<AudioToTextToken> {
  const token = await getSubscriptionToken(inngest, {
    channel: audioToTextChannel(),
    topics: ["status"],
  });

  return token;
}






