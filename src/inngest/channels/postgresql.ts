import { channel, topic } from '@inngest/realtime';

export const POSTGRESQL_CHANNEL_NAME = 'postgresql-execution';

export const postgresqlChannel = channel(POSTGRESQL_CHANNEL_NAME)
    .addTopic(
        topic('status').type<{
            nodeId: string;
            status: 'loading' | 'success' | 'error';
        }>(),
    );

