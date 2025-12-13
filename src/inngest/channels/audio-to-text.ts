import { channel, topic } from '@inngest/realtime';

export const AUDIO_TO_TEXT_CHANNEL_NAME = 'audio-to-text-execution';

export const audioToTextChannel = channel(AUDIO_TO_TEXT_CHANNEL_NAME)
    .addTopic(
        topic('status').type<{
            nodeId: string;
            status: 'loading' | 'success' | 'error';
        }>(),
    );






