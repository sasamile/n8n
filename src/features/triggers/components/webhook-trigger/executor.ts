import type { NodeExecutor } from "@/features/executions/types";
import { webhookTriggerChannel } from "@/inngest/channels/webhook-trigger";
import { NonRetriableError } from "inngest";


type WebhookTriggerData = Record<string, unknown>;

export const webhookTriggerExecutor: NodeExecutor<WebhookTriggerData> = async ({
    nodeId,
    context, 
    step,
    publish,
}) => {
    // Check if this execution was triggered by a webhook (has webhook data in context)
    const hasWebhookData = context && typeof context === 'object' && 'webhook' in context;

    if (!hasWebhookData) {
        // If no webhook data, this shouldn't happen in normal operation
        // (the execute button should not be shown for webhook triggers)
        // But if it does happen, just pass through without marking as success
        // The workflow will continue but the webhook node won't show success
        return context;
    }

    // Webhook data exists - this is a real webhook execution
    await publish(
        webhookTriggerChannel().status({
            nodeId,
            status: 'loading',
        })
    );

    const result = await step.run('webhook-trigger', async () => context);

    await publish(
        webhookTriggerChannel().status({
            nodeId,
            status: 'success',
        })
    );

    return result;
};

