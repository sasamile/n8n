'use server';

import { getSubscriptionToken, type Realtime } from "@inngest/realtime";

import { inngest } from "@/inngest/client";
import { postgresqlChannel } from "@/inngest/channels/postgresql";

export type PostgreSQLToken = Realtime.Token<
    typeof postgresqlChannel,
    ['status']
>;

export async function fetchPostgreSQLRealtimeToken(): Promise<PostgreSQLToken> {
    const token = await getSubscriptionToken(inngest, {
        channel: postgresqlChannel(),
        topics: ['status'],
    });

    return token;
};

