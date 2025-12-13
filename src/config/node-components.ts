import { InitialNode } from "@/components/initial-node";
import { AnthropicNode } from "@/features/executions/components/anthropic/node";
import { DiscordNode } from "@/features/executions/components/discord/node";
import { GeminiNode } from "@/features/executions/components/gemini/node";
import { HttpRequestNode } from "@/features/executions/components/http-request/node";
import { OpenAiNode } from "@/features/executions/components/openai/node";
import { SlackNode } from "@/features/executions/components/slack/node";
import { RedisNode } from "@/features/executions/components/redis/node";
import { PostgreSQLNode } from "@/features/executions/components/postgresql/node";
import { BotRouterNode } from "@/features/executions/components/bot-router/node";
import { AiAgentNode } from "@/features/executions/components/ai-agent/node";
import { SwitchNode } from "@/features/executions/components/switch/node";
import { ImageToTextNode } from "@/features/executions/components/image-to-text/node";
import { AudioToTextNode } from "@/features/executions/components/audio-to-text/node";
import { GoogleFormTrigger } from "@/features/triggers/components/google-form-trigger/node";
import { ManualTriggerNode } from "@/features/triggers/components/manual-trigger/node";
import { StripeTriggerNode } from "@/features/triggers/components/stripe-trigger/node";
import { WebhookTriggerNode } from "@/features/triggers/components/webhook-trigger/node";
import { NodeType } from "@/generated/prisma";
import { NodeTypes } from "@xyflow/react";

export const nodeComponents = {
    [NodeType.INITIAL]: InitialNode,
    [NodeType.HTTP_REQUEST]: HttpRequestNode,
    [NodeType.MANUAL_TRIGGER]: ManualTriggerNode,
    [NodeType.GOOGLE_FORM_TRIGGER]: GoogleFormTrigger,
    [NodeType.STRIPE_TRIGGER]: StripeTriggerNode,
    [NodeType.WEBHOOK_TRIGGER]: WebhookTriggerNode,
    [NodeType.BOT_ROUTER]: BotRouterNode,
    [NodeType.GEMINI]: GeminiNode,
    [NodeType.OPENAI]: OpenAiNode,
    [NodeType.ANTHROPIC]: AnthropicNode,
    [NodeType.DISCORD]: DiscordNode,
    [NodeType.SLACK]: SlackNode,
    [NodeType.REDIS]: RedisNode,
    [NodeType.POSTGRESQL]: PostgreSQLNode,
    [NodeType.AI_AGENT]: AiAgentNode,
    [NodeType.SWITCH]: SwitchNode,
    [NodeType.IMAGE_TO_TEXT]: ImageToTextNode,
    [NodeType.AUDIO_TO_TEXT]: AudioToTextNode,
} as const satisfies NodeTypes;

export type RegisteredNodeType = keyof typeof nodeComponents; 