"use client";

import { useReactFlow, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo, useState, useMemo } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { AI_AGENT_CHANNEL_NAME } from "@/inngest/channels/ai-agent";
import { AiAgentDialog, AiAgentFormValues } from "./dialog";
import { fetchAiAgentRealtimeToken } from "./actions";
import { BaseHandle } from "@/components/react-flow/base-handle";
import { BaseNode, BaseNodeContent } from '@/components/react-flow/base-node';
import { NodeStatusIndicator } from "@/components/react-flow/node-status-indicator";
import { WorkflowNode } from "@/components/workflow-node";
import Image from 'next/image';

type AiAgentNodeData = {
  variableName?: string;
  modelType?: "OPENAI" | "ANTHROPIC" | "GEMINI";
  credentialId?: string;
  systemPrompt?: string;
  userPrompt?: string;
};

type AiAgentNodeType = Node<AiAgentNodeData>;

export const AiAgentNode = memo((props: NodeProps<AiAgentNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes, getEdges } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: AI_AGENT_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchAiAgentRealtimeToken,
  });

  // Get connected tool nodes - only from handles that start with "tool-"
  // These are the special tool handles, not regular output connections
  const connectedTools = useMemo(() => {
    const edges = getEdges();
    // Only get edges where sourceHandle starts with "tool-"
    return edges.filter(edge => 
      edge.source === props.id && 
      edge.sourceHandle && 
      edge.sourceHandle.startsWith('tool-')
    );
  }, [getEdges, props.id]);

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: AiAgentFormValues) => {
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
  const modelType = nodeData?.modelType || "OPENAI";
  
  const getModelName = () => {
    switch (modelType) {
      case "OPENAI":
        return "gpt-4o-mini";
      case "ANTHROPIC":
        return "claude-3-5-sonnet";
      case "GEMINI":
        return "gemini-1.5-flash";
      default:
        return "AI";
    }
  };

  const description = nodeData?.userPrompt
    ? `${getModelName()}: ${nodeData.userPrompt.slice(0, 50)}...${toolsCount > 0 ? ` (${toolsCount} tool${toolsCount > 1 ? 's' : ''})` : ''}`
    : `Not configured${toolsCount > 0 ? ` (${toolsCount} tool${toolsCount > 1 ? 's' : ''})` : ''}`;

  const getModelIcon = () => {
    switch (modelType) {
      case "OPENAI":
        return "/logos/openai.svg";
      case "ANTHROPIC":
        return "/logos/anthropic.svg";
      case "GEMINI":
        return "/logos/gemini.svg";
      default:
        return "/logos/openai.svg";
    }
  };

  const handleDelete = () => {
    setNodes((currentNodes) => {
      return currentNodes.filter((node) => node.id !== props.id);
    });
  };

  return (
    <>
      <AiAgentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
        connectedToolsCount={toolsCount}
      />
      <WorkflowNode
        name="AI Agent"
        description={description}
        onDelete={handleDelete}
        onSettings={handleOpenSettings}
      >
        <NodeStatusIndicator variant='border' status={nodeStatus}>
          <BaseNode status={nodeStatus} onDoubleClick={handleOpenSettings}>
            <BaseNodeContent className="relative flex items-center justify-center p-2" style={{ paddingRight: '24px', minHeight: `${Math.max(32, (toolsCount + 1) * 14 + 8)}px` }}>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <Image src={getModelIcon()} alt="AI Agent" width={14} height={14} />
              </div>
              {/* Input handle */}
              <BaseHandle 
                id={'target-1'}
                type="target"
                position={Position.Left}
              />
              {/* Output handle (for normal flow) - positioned at top to avoid conflict with tool handles */}
              <BaseHandle 
                id={'source-1'}
                type="source"
                position={Position.Right}
                style={{ top: '8%' }}
                title="Salida normal del flujo"
              />
              {/* Tool handles - special handles for connecting tools */}
              {Array.from({ length: Math.max(toolsCount, 3) }).map((_, index) => {
                const toolIndex = index + 1;
                const totalHandles = Math.max(toolsCount, 3);
                // Start tool handles below the source-1 handle (which is at 8%)
                // Distribute them in the remaining 92% of space
                const availableSpace = 92; // Space below source-1
                const spacing = availableSpace / (totalHandles + 1);
                const yPercent = 8 + (spacing * toolIndex); // Start after source-1
                return (
                  <BaseHandle
                    key={`tool-${toolIndex}`}
                    id={`tool-${toolIndex}`}
                    type="source"
                    position={Position.Right}
                    style={{ 
                      top: `${yPercent}%`,
                      background: '#fbbf24', // Yellow/orange color to distinguish from regular handles
                      borderColor: '#f59e0b',
                    }}
                    title="Conectar herramientas aquí"
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

AiAgentNode.displayName = "AiAgentNode";

