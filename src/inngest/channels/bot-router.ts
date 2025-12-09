import { channel, topic } from '@inngest/realtime';

export const BOT_ROUTER_CHANNEL_NAME = 'bot-router-execution';

export const botRouterChannel = channel(BOT_ROUTER_CHANNEL_NAME)
    .addTopic(
        topic('status').type<{
            nodeId: string;
            status: 'loading' | 'success' | 'error';
        }>(),
    );

