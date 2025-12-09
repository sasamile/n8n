'use server';

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";

import { inngest } from "@/inngest/client";
import { redisChannel } from "@/inngest/channels/redis";

export type RedisToken = Realtime.Token<
    typeof redisChannel,
    ['status']
>;

export async function fetchRedisRealtimeToken(): Promise<RedisToken> {
    const token = await getSubscriptionToken(inngest, {
        channel: redisChannel(),
        topics: ['status'],
    });

    return token;
};

