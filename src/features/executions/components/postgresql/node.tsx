"use client";

import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { POSTGRESQL_CHANNEL_NAME } from "@/inngest/channels/postgresql";
import { PostgreSQLDialog, PostgreSQLFormValues } from "./dialog";
import { fetchPostgreSQLRealtimeToken } from "./actions";

type PostgreSQLNodeData = {
  variableName?: string;
  credentialId?: string;
  query?: string;
};

type PostgreSQLNodeType = Node<PostgreSQLNodeData>;

export const PostgreSQLNode = memo((props: NodeProps<PostgreSQLNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: POSTGRESQL_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchPostgreSQLRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: PostgreSQLFormValues) => {
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
  const description = nodeData?.query
    ? `SQL: ${nodeData.query.slice(0, 50)}...`
    : "Not configured";

  return (
    <>
      <PostgreSQLDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon="/logos/postgresql.svg"
        name="PostgreSQL"
        status={nodeStatus}
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

PostgreSQLNode.displayName = "PostgreSQLNode";

