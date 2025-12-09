import Handlebars from 'handlebars';
import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import OpenAI from 'openai';
import { openaiChannel } from '@/inngest/channels/openai';
import prisma from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { getConnectedToolNodes, executeToolNode, nodeToToolFunction } from '@/features/executions/lib/tool-helpers';
import type { Node as PrismaNode } from '@/generated/prisma';

Handlebars.registerHelper('json', (context) => {
    const jsonString = JSON.stringify(context, null, 2);
    const safeString = new Handlebars.SafeString(jsonString);

    return safeString;
});

type OpenAiData = {
    variableName?: string;
    credentialId?: string;
    systemPrompt?: string;
    userPrompt?: string;
};

export const openaiExecutor: NodeExecutor<OpenAiData> = async ({
    data,
    nodeId,
    userId,
    context,
    step,
    publish,
    workflow,
}) => {
    // Publish 'loading' state for http request
    await publish(
       openaiChannel().status({
            nodeId,
            status: 'loading',
        }),
    );

    if (!data.variableName) {
        await publish(
            openaiChannel().status({
                nodeId,
                status: 'error',
            }),
        );

        throw new NonRetriableError('OpenAI node: Variable name is missing');
    };

    if (!data.credentialId) {
            await publish(
                openaiChannel().status({
                    nodeId,
                    status: 'error',
                }),
            );
    
            throw new NonRetriableError('OpenAI node: Credential is required');
        };
    

    if (!data.userPrompt) {
        await publish(
            openaiChannel().status({
                nodeId,
                status: 'error',
            }),
        );

        throw new NonRetriableError('OpenAI node: User prompt is missing');
    };

    // Get connected tool nodes first to check if tools are available
    const toolNodes = workflow 
        ? getConnectedToolNodes(nodeId, workflow.nodes, workflow.connections)
        : [];
    
    let systemPrompt: string;
    let userPrompt: string;
    
    try {
        const baseSystemPrompt = data.systemPrompt
            ? Handlebars.compile(data.systemPrompt)(context)
            : 'You are a helpful assistant';
        
        // Extract business context if available
        const negocioData = (context as any).negocio;
        const businessName = negocioData?.httpResponse?.data?.negocio || 'el negocio';
        const businessPrompt = negocioData?.httpResponse?.data?.prompt || '';
        const businessContext = `${businessPrompt ? `Eres el asistente virtual de ${businessName}. ${businessPrompt}` : `Eres el asistente virtual de ${businessName}.`}`;
        
        // Build system prompt with business context
            systemPrompt = `${baseSystemPrompt}

IMPORTANTE - CONTEXTO DEL NEGOCIO:
${businessContext}

SIEMPRE incluye el nombre del negocio (${businessName}) en tus respuestas cuando sea apropiado.`;
        
        console.log(`[OpenAI ${nodeId}] Final system prompt length:`, systemPrompt.length);
    } catch (error) {
        console.error(`[OpenAI ${nodeId}] Error compiling system prompt:`, error);
        systemPrompt = 'You are a helpful assistant';
    }
    
    try {
        userPrompt = Handlebars.compile(data.userPrompt)(context);
        console.log(`[OpenAI ${nodeId}] Compiled user prompt:`, userPrompt.substring(0, 200));
    } catch (error) {
        console.error(`[OpenAI ${nodeId}] Error compiling user prompt:`, error);
        throw new NonRetriableError(`   OpenAI node: Failed to compile user prompt: ${error instanceof Error ? error.message : String(error)}`);
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
            openaiChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Credential not found');
    };

    const openai = new OpenAI({
        apiKey: decrypt(credential.value),
    });

    try {
        // Build tools array for OpenAI API format
        const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
        const toolNodeMap = new Map<string, PrismaNode>();
        
        // Create tool definitions from connected tool nodes
            for (const toolNode of toolNodes) {
            const toolDef = nodeToToolFunction(toolNode);
            const toolName = toolDef.function.name;
            toolNodeMap.set(toolName, toolNode);
            
            tools.push({
                type: 'function',
                function: {
                    name: toolName,
                    description: toolDef.function.description,
                    parameters: toolDef.function.parameters,
                },
            });
        }
        
        console.log(`[OpenAI ${nodeId}] Tools available:`, tools.length);

        // Initialize conversation history
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content: systemPrompt,
            },
            {
                role: 'user',
                content: userPrompt,
            },
        ];

        let finalText = '';
        let currentContext = context;
        const maxIterations = 10;
        let iteration = 0;

        // Main loop: continue until model returns text without tool calls
        while (iteration < maxIterations) {
            iteration++;
            console.log(`[OpenAI ${nodeId}] Iteration ${iteration}/${maxIterations}`);

            // Prepare request options
            const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
                model: 'gpt-4o-mini',
                messages: messages,
                temperature: 0.7,
            };

            // Add tools only if available and this is the first iteration or we're continuing after a tool call
            if (tools.length > 0) {
                requestOptions.tools = tools;
                requestOptions.tool_choice = 'auto'; // Let the model decide
            }

            // Make API call
            const response = await step.run(
                `openai-chat-completion-${iteration}`,
                async () => {
                    return await openai.chat.completions.create(requestOptions);
                }
            );

            const choice = response.choices[0];
            if (!choice || !choice.message) {
                throw new NonRetriableError('No response from OpenAI');
            }

            const assistantMessage = choice.message;

            // Add assistant message to history
            const toolCalls = assistantMessage.tool_calls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | undefined;
            messages.push({
                role: 'assistant',
                content: assistantMessage.content || null,
                tool_calls: toolCalls,
            });

            // Check if model wants to use tools
            if (toolCalls && toolCalls.length > 0) {
                console.log(`[OpenAI ${nodeId}] Model requested ${toolCalls.length} tool call(s)`);
                
                // Execute each tool call that the model requested
                for (const toolCall of toolCalls) {
                    if (toolCall.type !== 'function') {
                        console.warn(`[OpenAI ${nodeId}] Skipping non-function tool call: ${toolCall.type}`);
                        continue;
                    }
                    
                    const toolName = toolCall.function.name;
                    const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                    
                    console.log(`[OpenAI ${nodeId}] Executing tool: ${toolName} with args:`, toolArgs);
                    
                    // Find the tool node by name
                    const toolNode = toolNodeMap.get(toolName);
                    if (!toolNode) {
                        console.error(`[OpenAI ${nodeId}] Tool node not found for: ${toolName}`);
                        // Add error message to conversation
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: JSON.stringify({ error: `Tool ${toolName} not found` }),
                        });
                        continue;
                    }

                    try {
                        // Execute the tool node
                        const toolContext = { ...currentContext, ...toolArgs };
                        const toolResult = await executeToolNode(
                        toolNode,
                        toolContext,
                        userId,
                        step,
                        publish,
                        workflow!
                    );

                    // Get variable name from tool node data
                    const toolData = toolNode.data as { variableName?: string };
                    const varName = toolData?.variableName || toolName;
                        const resultValue = toolResult[varName] || toolResult;

                        // Update context with tool result
                        currentContext = { ...currentContext, ...toolResult };

                        // Add tool result message to conversation
                        const toolResultContent = typeof resultValue === 'string' 
                            ? resultValue 
                            : JSON.stringify(resultValue);
                        
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: toolResultContent,
                        });

                        console.log(`[OpenAI ${nodeId}] Tool ${toolName} executed successfully`);
                    } catch (error) {
                        console.error(`[OpenAI ${nodeId}] Error executing tool ${toolName}:`, error);
                        // Add error message to conversation
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: JSON.stringify({ 
                                error: `Error executing tool: ${error instanceof Error ? error.message : String(error)}` 
                            }),
                        });
                    }
                }

                // Continue loop to get final response from model
                continue;
            }

            // No tool calls - model returned final text
            finalText = assistantMessage.content || '';
            console.log(`[OpenAI ${nodeId}] Final response received (no more tool calls)`);
            break;
        }

        // If we reached max iterations without final answer
        if (!finalText && iteration >= maxIterations) {
            console.warn(`[OpenAI ${nodeId}] Max iterations reached, using last message content`);
            const lastMessage = messages[messages.length - 1];
            if (lastMessage && 'content' in lastMessage && lastMessage.content) {
                finalText = typeof lastMessage.content === 'string' 
                    ? lastMessage.content 
                    : 'No pude procesar tu solicitud completamente.';
            } else {
                finalText = 'No pude procesar tu solicitud completamente después de múltiples intentos.';
            }
        }
        
        await publish(
            openaiChannel().status({
                nodeId,
                status: 'success',
            }),
        );

        return {
            ...currentContext,
            [data.variableName]: {
                text: finalText,
            },
        }
    } catch (error) {
        await publish(
            openaiChannel().status({
                nodeId,
                status: 'error',
            }),
        );

        throw error;
    };
}