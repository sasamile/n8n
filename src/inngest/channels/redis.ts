import { channel, topic } from '@inngest/realtime';

export const REDIS_CHANNEL_NAME = 'redis-execution';

export const redisChannel = channel(REDIS_CHANNEL_NAME)
    .addTopic(
        topic('status').type<{
            nodeId: string;
            status: 'loading' | 'success' | 'error';
        }>(),
    );

