
import { NonRetriableError } from "inngest";
import { inngest } from "./client";
import prisma from "@/lib/db";
import { topologicalSort } from "./utils";
import { filterNodesByBotRouting, getSelectedBotFromContext, filterNodesBySwitchRouting } from "./routing-utils";
import { getExecutor } from "@/features/executions/lib/executor-registry";
import { ExecutionStatus, NodeType } from "@/generated/prisma";
import { httpRequestChannel } from "./channels/http-request";
import { manualTriggerChannel } from "./channels/manual-trigger";
import { googleFormTriggerChannel } from "./channels/google-form-trigger";
import { stripeTriggerChannel } from "./channels/stripe-trigger";
import { webhookTriggerChannel } from "./channels/webhook-trigger";
import { geminiChannel } from "./channels/gemini";
import { openaiChannel } from "./channels/openai";
import { anthropicChannel } from "./channels/anthropic";
import { discordChannel } from "./channels/discord";
import { slackChannel } from "./channels/slack";
import { redisChannel } from "./channels/redis";
import { postgresqlChannel } from "./channels/postgresql";
import { botRouterChannel } from "./channels/bot-router";
import { switchChannel } from "./channels/switch";
import { imageToTextChannel } from "./channels/image-to-text";
import { audioToTextChannel } from "./channels/audio-to-text";

export const executeWorkflow = inngest.createFunction(
  { 
    id: "execute-workflow",
    retries: process.env.NODE_ENV === 'production' ? 3 : 0,
    onFailure: async ({ event, step }) => {
      return prisma.execution.update({
        where: { inngestEventId: event.data.event.id },
        data: {
          status: ExecutionStatus.FAILED,
          error: event.data.error.message,
          errorStack: event.data.error.stack,
        },
      });
    }
  },
  { 
    event: "workflows/execute.workflow",
    channels: [
      httpRequestChannel(),
      manualTriggerChannel(),
      googleFormTriggerChannel(),
      stripeTriggerChannel(),
      webhookTriggerChannel(),
      geminiChannel(),
      openaiChannel(),
      anthropicChannel(),
      discordChannel(),
      slackChannel(),
      redisChannel(),
      postgresqlChannel(),
      botRouterChannel(),
      switchChannel(),
      imageToTextChannel(),
      audioToTextChannel(),
    ],
  },
  async ({ event, step, publish }) => {
    const inngestEventId = event.id;
    const workflowId = await event.data.workflowId;

    if (!inngestEventId || !workflowId) {
      throw new NonRetriableError('Inngest ID or Workflow ID is missing');
    };

    await step.run('create-execution', async () => {
      return prisma.execution.create({
        data: {
          workflowId,
          inngestEventId,
        },
      });
    });

    const { sortedNodes, workflow } = await step.run('prepare-workflow', async () => {
      const workflowData = await prisma.workflow.findUniqueOrThrow({
        where: { id: workflowId },
        include: {
          nodes: true,
          connections: true,
        },
      });

      return {
        sortedNodes: topologicalSort(workflowData.nodes, workflowData.connections),
        workflow: workflowData,
      };
    });

    const userId = await step.run('get-user-id', async () => {
      const workflowData = await prisma.workflow.findUniqueOrThrow({
        where: { id: workflowId },
        select: {
          userId: true,
        },
      });

      return workflowData.userId;
    });

    //Initiaite the context with any initial data from the trigger
    let context = event.data.initialData || {};

    // Identify tool nodes (nodes connected from tool-* handles of AI Agent)
    // These should ONLY be executed when AI Agent explicitly calls them, NOT in normal flow
    const toolNodeIds = new Set<string>();
    workflow.connections.forEach(conn => {
        if (conn.fromOutput && conn.fromOutput.startsWith('tool-')) {
            toolNodeIds.add(conn.toNodeId);
        }
    });
    
    console.log(`[WorkflowExecution] Tool nodes identified (will be excluded from normal flow):`, Array.from(toolNodeIds));

    // Track which nodes should be executed (starts with all nodes EXCEPT tool nodes)
    // Tool nodes will only be executed when AI Agent calls them explicitly
    const nodesToExecute = new Set(
        sortedNodes
            .filter(n => !toolNodeIds.has(n.id))
            .map(n => n.id)
    );
    
    console.log(`[WorkflowExecution] Nodes to execute in normal flow: ${nodesToExecute.size} (excluded ${toolNodeIds.size} tool nodes)`);

    //Execute each node
    for (const node of sortedNodes) {
      // Skip nodes that are not in the execution set
      if (!nodesToExecute.has(node.id)) {
        continue;
      }

      const executor = getExecutor(node.type as NodeType);
      context = await executor({
        data: node.data as Record<string, unknown>,
        nodeId: node.id,
        userId,
        context,
        step,
        publish,
        workflow: {
          nodes: workflow.nodes,
          connections: workflow.connections,
        },
      });

      // Handle Bot Router: filter nodes based on selected bot
      if (node.type === NodeType.BOT_ROUTER) {
        const selectedBot = getSelectedBotFromContext(node.data, context);
        if (selectedBot) {
          filterNodesByBotRouting(
            node.id,
            selectedBot,
            sortedNodes,
            workflow.connections,
            nodesToExecute
          );
        }
      }

      // Handle Switch: filter nodes based on condition result
      if (node.type === NodeType.SWITCH) {
        const switchResult = context[node.data?.variableName as string] as { result?: number } | undefined;
        if (switchResult?.result !== undefined) {
          // result is now the matched case index (-1 for default case)
          filterNodesBySwitchRouting(
            node.id,
            switchResult.result,
            sortedNodes,
            workflow.connections,
            nodesToExecute
          );
        }
      }
    };

    await step.run('update-execution', async () => {
      return prisma.execution.update({
        where: { inngestEventId, workflowId },
        data: {
          status: ExecutionStatus.SUCCESS,
          completedAt: new Date(),
          output: context,
        },
      })
    })

    return { 
      workflowId,
      result: context,
     };
  },
)