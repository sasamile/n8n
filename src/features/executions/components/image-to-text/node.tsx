"use client";

import { useReactFlow, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo, useState } from "react";
import { useNodeStatus } from "../../hooks/use-node-status";
import { IMAGE_TO_TEXT_CHANNEL_NAME } from "@/inngest/channels/image-to-text";
import { ImageToTextDialog, ImageToTextFormValues } from "./dialog";
import { fetchImageToTextRealtimeToken } from "./actions";
import { BaseHandle } from "@/components/react-flow/base-handle";
import { BaseNode, BaseNodeContent } from '@/components/react-flow/base-node';
import { NodeStatusIndicator } from "@/components/react-flow/node-status-indicator";
import { WorkflowNode } from "@/components/workflow-node";
import { ImageIcon } from "lucide-react";

type ImageToTextNodeData = {
  variableName?: string;
  credentialId?: string;
  imageUrl?: string;
  prompt?: string;
};

type ImageToTextNodeType = Node<ImageToTextNodeData>;

export const ImageToTextNode = memo((props: NodeProps<ImageToTextNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes, setEdges } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: IMAGE_TO_TEXT_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchImageToTextRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: ImageToTextFormValues) => {
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
  const description = nodeData?.imageUrl
    ? `Image: ${nodeData.imageUrl.substring(0, 30)}${nodeData.imageUrl.length > 30 ? '...' : ''}`
    : "Not configured";

  return (
    <>
      <ImageToTextDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <WorkflowNode
        name="Image to Text"
        description={description}
        onDelete={handleDelete}
        onSettings={handleOpenSettings}
      >
        <NodeStatusIndicator variant='border' status={nodeStatus}>
          <BaseNode status={nodeStatus} onDoubleClick={handleOpenSettings}>
            <BaseNodeContent className="relative flex items-center justify-center" style={{ paddingRight: '30px', minHeight: '50px' }}>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <ImageIcon className="w-4 h-4" />
              </div>
              <BaseHandle 
                id={'target-1'}
                type="target"
                position={Position.Left}
              />
              <BaseHandle
                id={'source-1'}
                type="source"
                position={Position.Right}
              />
            </BaseNodeContent>
          </BaseNode>
        </NodeStatusIndicator>
      </WorkflowNode>
    </>
  );
});

ImageToTextNode.displayName = "ImageToTextNode";






