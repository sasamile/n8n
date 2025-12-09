import { NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { Webhook } from "lucide-react";
import { BaseTriggerNode } from "../base-trigger-node";
import { useNodeStatus } from "@/features/executions/hooks/use-node-status";
import {  fetchWebhookTriggerRealtimeToken } from "./actions";
import { WebhookTriggerDialog } from "./dialog";
import { WEBHOOK_TRIGGER_CHANNEL_NAME } from "@/inngest/channels/webhook-trigger";

export const WebhookTriggerNode =memo((props: NodeProps) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    
    const nodeStatus = useNodeStatus({
            nodeId: props.id,
            channel: WEBHOOK_TRIGGER_CHANNEL_NAME,
            topic: 'status',
            refreshToken: fetchWebhookTriggerRealtimeToken,
        });

    const handleOpenSettings = () => setDialogOpen(true);
    
    return (
        <>
            <WebhookTriggerDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
             />
            <BaseTriggerNode
                {...props}
                icon={Webhook}
                name="Webhook"
                description="When webhook is received"
                status={nodeStatus}
                onSettings={handleOpenSettings}
                onDoubleClick={handleOpenSettings}
            />
        </>
    )
});

WebhookTriggerNode.displayName = 'WebhookTriggerNode';

