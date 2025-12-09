"use client";

import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { REDIS_CHANNEL_NAME } from "@/inngest/channels/redis";
import { RedisDialog, RedisFormValues } from "./dialog";
import { fetchRedisRealtimeToken } from "./actions";

type RedisNodeData = {
  variableName?: string;
  credentialId?: string;
  operation?: "GET" | "SET" | "DELETE" | "INCR" | "DECR" | "EXISTS";
  key?: string;
  value?: string;
};

type RedisNodeType = Node<RedisNodeData>;

export const RedisNode = memo((props: NodeProps<RedisNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: REDIS_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchRedisRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: RedisFormValues) => {
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

  const nodeData = props.data;
  const description = nodeData?.key
    ? `${nodeData.operation || 'GET'}: ${nodeData.key.slice(0, 30)}...`
    : "Not configured";

  return (
    <>
      <RedisDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon="/logos/redis.svg"
        name="Redis"
        status={nodeStatus}
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

RedisNode.displayName = "RedisNode";

