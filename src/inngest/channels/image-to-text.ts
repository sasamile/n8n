import { channel, topic } from '@inngest/realtime';

export const IMAGE_TO_TEXT_CHANNEL_NAME = 'image-to-text-execution';

export const imageToTextChannel = channel(IMAGE_TO_TEXT_CHANNEL_NAME)
    .addTopic(
        topic('status').type<{
            nodeId: string;
            status: 'loading' | 'success' | 'error';
        }>(),
    );






