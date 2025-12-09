"use client";

import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { memo, useState, useMemo } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { OPENAI_CHANNEL_NAME } from "@/inngest/channels/openai";
import { OpenAiDialog, OpenAiFormValues } from "./dialog";
import { fetchOpenAiRealtimeToken } from "./actions";

type OpenAiNodeData = {
  variableName?: string;
  credentialId?: string;
  systemPrompt?: string;
  userPrompt?: string;
};

type OpenAiNodeType = Node<OpenAiNodeData>;

export const OpenAiNode = memo((props: NodeProps<OpenAiNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes, setEdges, getEdges } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: OPENAI_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchOpenAiRealtimeToken,
  });

  // Get connected tool nodes (edges where this node is the source)
  const connectedTools = useMemo(() => {
    const edges = getEdges();
    return edges.filter(edge => edge.source === props.id);
  }, [getEdges, props.id]);

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: OpenAiFormValues) => {
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
  const toolsCount = connectedTools.length;
  const description = nodeData?.userPrompt
    ? `gpt-4o-mini: ${nodeData.userPrompt.slice(0, 50)}...${toolsCount > 0 ? ` (${toolsCount} tool${toolsCount > 1 ? 's' : ''})` : ''}`
    : `Not configured${toolsCount > 0 ? ` (${toolsCount} tool${toolsCount > 1 ? 's' : ''})` : ''}`;

  return (
    <>
      <OpenAiDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
        connectedToolsCount={toolsCount}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={"/logos/openai.svg"}
        name="OpenAI"
        status={nodeStatus}
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

OpenAiNode.displayName = "OpenAiNode";
