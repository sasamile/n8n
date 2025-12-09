import Handlebars from 'handlebars';
import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { botRouterChannel } from '@/inngest/channels/bot-router';
import prisma from '@/lib/db';
import { decrypt } from '@/lib/encryption';

Handlebars.registerHelper('json', (context) => {
    const jsonString = JSON.stringify(context, null, 2);
    const safeString = new Handlebars.SafeString(jsonString);
    return safeString;
});

type BotRouterData = {
    variableName?: string;
    credentialId?: string;
    messageField?: string;
    availableBots?: string[];
};

const INTENT_DETECTION_SYSTEM_PROMPT = `Eres un asistente experto en análisis de intenciones. Tu tarea es analizar el mensaje del usuario y determinar a qué bot especializado debe dirigirse.

Bots disponibles:
- normal: Para conversaciones generales, preguntas sobre productos/servicios, información básica
- finanzas: Para consultas sobre facturas, pagos, estados de cuenta, información financiera
- soporte: Para problemas técnicos, errores, soporte técnico, troubleshooting
- atencion: Para atención al cliente, quejas, reclamos, solicitudes especiales

Responde ÚNICAMENTE con el nombre del bot en minúsculas (normal, finanzas, soporte, o atencion). No incluyas explicaciones ni texto adicional, solo el nombre del bot.`;

export const botRouterExecutor: NodeExecutor<BotRouterData> = async ({
    data,
    nodeId,
    userId,
    context,
    step,
    publish,
}) => {
    await publish(
        botRouterChannel().status({
            nodeId,
            status: 'loading',
        }),
    );

    if (!data.variableName) {
        await publish(
            botRouterChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Bot Router node: Variable name is missing');
    }

    if (!data.credentialId) {
        await publish(
            botRouterChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Bot Router node: Credential is required');
    }

    if (!data.messageField) {
        await publish(
            botRouterChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Bot Router node: Message field is missing');
    }

    if (!data.availableBots || data.availableBots.length === 0) {
        await publish(
            botRouterChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Bot Router node: At least one bot must be available');
    }

    // Compile message field with Handlebars
    let message: string;
    try {
        const messageTemplate = Handlebars.compile(data.messageField);
        message = messageTemplate(context);
    } catch (error) {
        await publish(
            botRouterChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError(`Bot Router node: Failed to compile message template: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!message || typeof message !== 'string') {
        await publish(
            botRouterChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Bot Router node: Invalid message after template compilation');
    }

    const credential = await step.run('get-credential', async () => {
        return prisma.credential.findUnique({
            where: {
                id: data.credentialId,
                userId,
            },
        });
    });

    if (!credential) {
        await publish(
            botRouterChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Credential not found');
    }

    // Determine which AI provider to use
    let aiProvider: any;
    let model: any;

    try {
        switch (credential.type) {
            case 'OPENAI': {
                const openai = createOpenAI({
                    apiKey: decrypt(credential.value),
                });
                model = openai('gpt-4o-mini');
                break;
            }
            case 'ANTHROPIC': {
                const anthropic = createAnthropic({
                    apiKey: decrypt(credential.value),
                });
                model = anthropic('claude-3-5-sonnet-20241022');
                break;
            }
            case 'GEMINI': {
                const google = createGoogleGenerativeAI({
                    apiKey: decrypt(credential.value),
                });
                model = google('gemini-1.5-flash');
                break;
            }
            default:
                throw new NonRetriableError(`Unsupported credential type: ${credential.type}`);
        }

        const { steps } = await step.ai.wrap(
            'bot-router-detect-intent',
            generateText,
            {
                model,
                system: INTENT_DETECTION_SYSTEM_PROMPT,
                prompt: `Analiza este mensaje y determina a qué bot debe dirigirse: "${message}"`,
                experimental_telemetry: {
                    isEnabled: true,
                    recordInputs: true,
                    recordOutputs: true,
                },
            },
        );

        const detectedBot = steps[0].content[0].type === 'text'
            ? steps[0].content[0].text.trim().toLowerCase()
            : 'normal';

        // Validate that detected bot is in available bots, otherwise default to normal
        const selectedBot = data.availableBots.includes(detectedBot) 
            ? detectedBot 
            : data.availableBots.includes('normal') 
                ? 'normal' 
                : data.availableBots[0];

        await publish(
            botRouterChannel().status({
                nodeId,
                status: 'success',
            }),
        );

        return {
            ...context,
            [data.variableName]: {
                intent: detectedBot,
                bot: selectedBot,
                message: message,
            },
        };
    } catch (error) {
        await publish(
            botRouterChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw error;
    }
};

