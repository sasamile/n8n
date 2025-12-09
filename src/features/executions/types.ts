import type { Realtime } from "@inngest/realtime";
import type { GetStepTools, Inngest } from "inngest";
import type { Node, Connection } from "@/generated/prisma";

export type WorkflowContext = Record<string, unknown>;
export type StepTools = GetStepTools<Inngest.Any>;

export interface NodeExecutorParams<TData = Record<string, unknown>> {
    data: TData;
    nodeId: string;
    userId: string;
    context: WorkflowContext;
    step: StepTools;
    publish: Realtime.PublishFn;
    workflow?: {
        nodes: Node[];
        connections: Connection[];
    };
};

export type NodeExecutor<TData = Record<string, unknown>> = (params: NodeExecutorParams<TData>,) => Promise<WorkflowContext>;