"use client";

import { useReactFlow, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo, useState } from "react";
import { useNodeStatus } from "../../hooks/use-node-status";
import { SWITCH_CHANNEL_NAME } from "@/inngest/channels/switch";
import { SwitchDialog, SwitchFormValues } from "./dialog";
import { fetchSwitchRealtimeToken } from "./actions";
import { BaseHandle } from "@/components/react-flow/base-handle";
import { BaseNode, BaseNodeContent } from '@/components/react-flow/base-node';
import { NodeStatusIndicator } from "@/components/react-flow/node-status-indicator";
import { WorkflowNode } from "@/components/workflow-node";
import { GitBranch } from "lucide-react";

type SwitchNodeData = {
  variableName?: string;
  condition?: string; // Legacy support
  cases?: Array<{ condition: string; label?: string }>;
};

type SwitchNodeType = Node<SwitchNodeData>;

export const SwitchNode = memo((props: NodeProps<SwitchNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes, setEdges } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: SWITCH_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchSwitchRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: SwitchFormValues) => {
    const newCasesCount = values.cases?.length || 0;
    const oldCasesCount = props.data?.cases?.length || (props.data?.condition ? 1 : 0);
    
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
    
    // Clean up invalid connections when number of cases changes
    if (newCasesCount !== oldCasesCount) {
      setEdges((edges) => {
        return edges.filter((edge) => {
          // Keep edges that are not from this switch node
          if (edge.source !== props.id) return true;
          
          // For edges from this switch, check if the sourceHandle is valid
          const sourceHandle = edge.sourceHandle;
          if (!sourceHandle) return true;
          
          // Extract index from sourceHandle (e.g., "source-0" -> 0)
          const match = sourceHandle.match(/^source-(\d+)$/);
          if (!match) return true; // Keep non-numeric handles (like "source-default")
          
          const handleIndex = parseInt(match[1], 10);
          // Keep only if the handle index is within the new cases count
          return handleIndex < newCasesCount;
        });
      });
    }
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
  const cases = nodeData?.cases || (nodeData?.condition ? [{ condition: nodeData.condition }] : []);
  const description = cases.length > 0
    ? `${cases.length} case${cases.length > 1 ? 's' : ''}`
    : "Not configured";

  return (
    <>
      <SwitchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <WorkflowNode
        name="Switch"
        description={description}
        onDelete={handleDelete}
        onSettings={handleOpenSettings}
      >
        <NodeStatusIndicator variant='border' status={nodeStatus}>
          <BaseNode status={nodeStatus} onDoubleClick={handleOpenSettings}>
            <BaseNodeContent className="relative flex items-center justify-center" style={{ paddingRight: '60px', minHeight: '60px' }}>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <GitBranch className="w-4 h-4" />
              </div>
              <BaseHandle 
                id={'target-1'}
                type="target"
                position={Position.Left}
              />
              {/* Generate handles for each case only - no default handle */}
              {cases.length > 0 && cases.map((caseItem, index) => {
                // Calculate position: distribute evenly from top to bottom
                // For n cases, position each at: (index + 1) / (n + 1) * 100%
                const numCases = cases.length;
                const spacing = 100 / (numCases + 1);
                const topPercent = spacing * (index + 1);
                
                const handleId = `source-${index}`;
                
                return (
                  <BaseHandle
                    key={`${props.id}-${handleId}`}
                    id={handleId}
                    type="source"
                    position={Position.Right}
                    style={{ 
                      top: `${topPercent}%` 
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

SwitchNode.displayName = "SwitchNode";






