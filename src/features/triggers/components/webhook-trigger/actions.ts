'use server';

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";

import { inngest } from "@/inngest/client";
import { webhookTriggerChannel } from "@/inngest/channels/webhook-trigger";

export type WebhookTriggerToken = Realtime.Token<
    typeof webhookTriggerChannel,
    ['status']
>;

export async function fetchWebhookTriggerRealtimeToken(): Promise<WebhookTriggerToken> {
    const token = await getSubscriptionToken(inngest, {
        channel: webhookTriggerChannel(),
        topics: ['status'],
    });

    return token;
};

