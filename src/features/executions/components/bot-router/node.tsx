"use client";

import { useReactFlow, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo, useState } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { BOT_ROUTER_CHANNEL_NAME } from "@/inngest/channels/bot-router";
import { BotRouterDialog, BotRouterFormValues } from "./dialog";
import { fetchBotRouterRealtimeToken } from "./actions";
import { BaseHandle } from "@/components/react-flow/base-handle";
import { BaseNode, BaseNodeContent } from '@/components/react-flow/base-node';
import { NodeStatusIndicator } from "@/components/react-flow/node-status-indicator";
import { WorkflowNode } from "@/components/workflow-node";
import Image from 'next/image';

type BotRouterNodeData = {
  variableName?: string;
  credentialId?: string;
  messageField?: string;
  availableBots?: string[];
};

// Order must match dialog.tsx BOT_OPTIONS
const BOT_OPTIONS_ORDER = ["normal", "finanzas", "soporte", "atencion"];

type BotRouterNodeType = Node<BotRouterNodeData>;

export const BotRouterNode = memo((props: NodeProps<BotRouterNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes, setEdges } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: BOT_ROUTER_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchBotRouterRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: BotRouterFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === props.id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...values,
            },
          };
        }
        return node;
      })
    );
  };

  const handleDelete = () => {
    setNodes((currentNodes) => {
      return currentNodes.filter((node) => node.id !== props.id);
    });
    setEdges((currentEdges) => {
      return currentEdges.filter((edge) => edge.source !== props.id && edge.target !== props.id);
    });
  };

  const nodeData = props.data;
  // Sort availableBots according to BOT_OPTIONS_ORDER to match visual handle order
  const rawAvailableBots = nodeData?.availableBots || ["normal"];
  const availableBots = rawAvailableBots.sort((a, b) => {
    const indexA = BOT_OPTIONS_ORDER.indexOf(a);
    const indexB = BOT_OPTIONS_ORDER.indexOf(b);
    // If bot not found in order, put it at the end
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
  const description = nodeData?.messageField
    ? `Routing: ${nodeData.messageField}`
    : "Not configured";

  return (
    <>
      <BotRouterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <WorkflowNode
        name="Bot Router"
        description={description}
        onDelete={handleDelete}
        onSettings={handleOpenSettings}
      >
        <NodeStatusIndicator variant='border' status={nodeStatus}>
          <BaseNode status={nodeStatus} onDoubleClick={handleOpenSettings}>
            <BaseNodeContent className="relative flex items-center justify-center" style={{ paddingRight: '30px', minHeight: `${Math.max(40, availableBots.length * 20 + 10)}px` }}>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <Image src="/logos/openai.svg" alt="Bot Router" width={16} height={16} />
              </div>
              <BaseHandle 
                id={'target-1'}
                type="target"
                position={Position.Left}
              />
              {availableBots.map((bot, index) => {
                const totalBots = availableBots.length;
                const spacing = 100 / (totalBots + 1);
                const yPercent = spacing * (index + 1);
                return (
                  <BaseHandle
                    key={bot}
                    id={`source-${bot}`}
                    type="source"
                    position={Position.Right}
                    style={{ 
                      top: `${yPercent}%`,
                    }}
                  />
                );
              })}
            </BaseNodeContent>
          </BaseNode>
        </NodeStatusIndicator>
      </WorkflowNode>
    </>
  );
});

BotRouterNode.displayName = "BotRouterNode";

