import Handlebars from 'handlebars';
import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { aiAgentChannel } from '@/inngest/channels/ai-agent';
import prisma from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { getConnectedToolNodes, executeToolNode, nodeToToolFunction } from '@/features/executions/lib/tool-helpers';
import type { Node as PrismaNode } from '@/generated/prisma';

Handlebars.registerHelper('json', (context) => {
    const jsonString = JSON.stringify(context, null, 2);
    const safeString = new Handlebars.SafeString(jsonString);
    return safeString;
});

type AiAgentData = {
    variableName?: string;
    modelType?: "OPENAI" | "ANTHROPIC" | "GEMINI";
    credentialId?: string;
    systemPrompt?: string;
    userPrompt?: string;
};

export const aiAgentExecutor: NodeExecutor<AiAgentData> = async ({
    data,
    nodeId,
    userId,
    context,
    step,
    publish,
    workflow,
}) => {
    await publish(
        aiAgentChannel().status({
            nodeId,
            status: 'loading',
        }),
    );

    if (!data.variableName) {
        await publish(
            aiAgentChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('AI Agent node: Variable name is missing');
    }

    if (!data.credentialId) {
        await publish(
            aiAgentChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('AI Agent node: Credential is required');
    }

    if (!data.userPrompt) {
        await publish(
            aiAgentChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('AI Agent node: User prompt is missing');
    }

    if (!data.modelType) {
        await publish(
            aiAgentChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('AI Agent node: Model type is required');
    }

    // Get connected tool nodes
    const toolNodes = workflow 
        ? getConnectedToolNodes(nodeId, workflow.nodes, workflow.connections)
        : [];
    
    let systemPrompt: string;
    let userPrompt: string;
    
    try {
        userPrompt = Handlebars.compile(data.userPrompt)(context);
        console.log(`[AI Agent ${nodeId}] Compiled user prompt:`, userPrompt.substring(0, 200));
    } catch (error) {
        console.error(`[AI Agent ${nodeId}] Error compiling user prompt:`, error);
        throw new NonRetriableError(`AI Agent node: Failed to compile user prompt: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Detect if the message is just a simple greeting or doesn't require tools
    const isSimpleGreeting = (message: string): boolean => {
        // Normalize: remove all whitespace, newlines, and convert to lowercase
        const normalized = message.trim().replace(/[\s\n\r\t]+/g, '').toLowerCase();
        
        // Check for exact matches with common greetings (case-insensitive, whitespace-agnostic)
        const exactGreetingPatterns = [
            'hola',
            'hi',
            'hey',
            'hello',
            'buenosdias',
            'buenosdías',
            'buenastardes',
            'buenasnoches',
            'saludos',
            'quetal',
            'quétal',
            'comestas',
            'cómoestás',
            'comoestas',
            'buendia',
            'buendía',
            'buendias',
            'buendías',
        ];
        
        // Check for exact match (after normalization)
        if (exactGreetingPatterns.some(greeting => normalized === greeting)) {
            console.log(`[AI Agent ${nodeId}] ✅ Detected exact greeting match: "${normalized}"`);
            return true;
        }
        
        // Check if message is just a greeting with optional punctuation and newlines
        // This pattern matches: "hola", "Hola", "Hola\n", "Hola!", "hola.", "hola?", etc.
        const greetingOnlyPattern = /^(hola|hi|hey|hello|buenos\s*d[ií]as?|buenas\s*tardes|buenas\s*noches|saludos|qué\s*tal|que\s*tal|cómo\s*estás|como\s*estas)[\s\n\r\.!?]*$/i;
        if (greetingOnlyPattern.test(message.trim())) {
            console.log(`[AI Agent ${nodeId}] ✅ Detected greeting-only pattern: "${message.trim()}"`);
            return true;
        }
        
        // Check if message is very short (less than 25 characters after normalization) and doesn't contain action words
        const actionWords = [
            'ver', 'mostrar', 'obtener', 'crear', 'agregar', 'buscar', 'consultar', 'listar', 
            'catálogo', 'catalogo', 'productos', 'producto', 'tareas', 'tarea', 
            'necesito', 'quiero', 'dame', 'muestra', 'muéstrame', 'muestrame', 'trae', 'traeme',
            'quierover', 'quiero ver', 'necesito ver', 'necesitover', 'mostrar', 'mostrarme',
            'listar', 'listame', 'dame el', 'dame la', 'quiero el', 'quiero la', 'necesito el', 'necesito la'
        ];
        const hasActionWord = actionWords.some(word => normalized.includes(word));
        
        // If it's a short message without action words, it's likely just a greeting
        if (normalized.length < 25 && !hasActionWord) {
            console.log(`[AI Agent ${nodeId}] ✅ Detected short message without action words: "${normalized}" (length: ${normalized.length})`);
            return true;
        }
        
        console.log(`[AI Agent ${nodeId}] ❌ NOT a simple greeting: "${normalized}" (length: ${normalized.length}, hasActionWord: ${hasActionWord})`);
        return false;
    };
    
    const shouldUseTools = !isSimpleGreeting(userPrompt) && toolNodes.length > 0;
    console.log(`[AI Agent ${nodeId}] ===== TOOL USAGE DECISION =====`);
    console.log(`[AI Agent ${nodeId}] User prompt: "${userPrompt}"`);
    console.log(`[AI Agent ${nodeId}] Is simple greeting:`, isSimpleGreeting(userPrompt));
    console.log(`[AI Agent ${nodeId}] Available tool nodes:`, toolNodes.length);
    console.log(`[AI Agent ${nodeId}] Should use tools:`, shouldUseTools);
    console.log(`[AI Agent ${nodeId}] =================================`);
    
    try {
        const baseSystemPrompt = data.systemPrompt
            ? Handlebars.compile(data.systemPrompt)(context)
            : 'You are a helpful assistant';
        
        // Extract business context if available
        const negocioData = (context as any).negocio;
        const businessName = negocioData?.httpResponse?.data?.negocio || 'el negocio';
        const businessPrompt = negocioData?.httpResponse?.data?.prompt || '';
        const businessContext = `${businessPrompt ? `Eres el asistente virtual de ${businessName}. ${businessPrompt}` : `Eres el asistente virtual de ${businessName}.`}`;
        
        // Add instructions about tool usage if tools are available
        if (toolNodes.length > 0) {
            systemPrompt = `${baseSystemPrompt}

IMPORTANTE - CONTEXTO DEL NEGOCIO:
${businessContext}

SIEMPRE incluye el nombre del negocio (${businessName}) en tus respuestas cuando sea apropiado.

REGLAS CRÍTICAS SOBRE HERRAMIENTAS - LEE CON ATENCIÓN:

🚫 PROHIBIDO ABSOLUTO - NUNCA USES HERRAMIENTAS EN ESTOS CASOS:
1. Si el usuario SOLO saluda → "hola", "Hola", "Hola\n", "buenos días", "hey", "hi", "hello" → Responde DIRECTAMENTE con un saludo amigable. NO uses herramientas. NUNCA. PROHIBIDO.
2. Si el usuario hace una pregunta general o conversación casual → "¿cómo están?", "¿qué tal?", "buen día" → Responde basándote ÚNICAMENTE en el contexto del negocio. NO uses herramientas.
3. Si el mensaje es muy corto y no menciona acciones específicas → NO uses herramientas.

✅ SOLO usa herramientas cuando el usuario pida EXPLÍCITAMENTE acciones específicas:

📋 PARA VER PRODUCTOS/CATÁLOGO - USA la herramienta que dice "Obtener catálogo de productos":
- "quiero ver el catálogo", "muéstrame productos", "ver productos", "quiero ver qué tienen"
- "mostrar catálogo", "dame el catálogo", "lista de productos", "qué productos tienen"
- Cualquier solicitud que mencione: "productos", "catálogo", "catalogo", "ver", "mostrar", "lista"

📝 PARA CREAR TAREAS - USA la herramienta que dice "Crear una nueva tarea":
- "quiero crear una tarea", "necesito crear una tarea", "agregar tarea", "hacer una tarea"
- "nueva tarea", "crear tarea", "agendar tarea"
- Cualquier solicitud que mencione: "crear tarea", "agregar tarea", "nueva tarea"

⚠️ CRÍTICO - LEE LAS DESCRIPCIONES DE CADA HERRAMIENTA ANTES DE USARLA:
- Cada herramienta tiene una descripción específica que indica CUÁNDO usarla
- NO uses una herramienta de "crear tarea" cuando el usuario pide "ver productos"
- NO uses una herramienta de "ver productos" cuando el usuario pide "crear tarea"
- LEE la descripción completa de cada herramienta antes de decidir cuál usar

🔒 REGLA DE ORO: Si tienes CUALQUIER DUDA sobre si usar una herramienta o cuál usar, NO la uses. Es MEJOR responder sin herramientas que ejecutar la herramienta incorrecta. Las herramientas consumen recursos y solo deben usarse cuando el usuario las solicita EXPLÍCITAMENTE y cuando eliges la herramienta CORRECTA.

EJEMPLOS CORRECTOS (SIN HERRAMIENTAS):
- Usuario: "hola" → ✅ Responde: "¡Hola! Soy el asistente virtual de ${businessName}. ${businessPrompt ? 'Basándome en nuestra información: ' + businessPrompt.substring(0, 100) + '... ' : ''}¿En qué puedo ayudarte hoy?" (SIN usar herramientas)
- Usuario: "Hola\n" → ✅ Responde con saludo amigable (SIN usar herramientas)
- Usuario: "buenos días" → ✅ Responde con saludo (SIN usar herramientas)

EJEMPLOS CORRECTOS (CON HERRAMIENTAS CORRECTAS):
- Usuario: "quiero ver el catálogo" → ✅ USA la herramienta "Obtener catálogo de productos" → Luego contesta: "Aquí está nuestro catálogo: [lista productos]"
- Usuario: "muéstrame los productos" → ✅ USA la herramienta "Obtener catálogo de productos"
- Usuario: "quiero crear una tarea" → ✅ USA la herramienta "Crear una nueva tarea"

EJEMPLOS INCORRECTOS (NO HACER):
- Usuario: "hola" → ❌ NO ejecutes herramientas de productos o tareas
- Usuario: "Hola\n" → ❌ NO ejecutes herramientas
- Usuario: "buenos días" → ❌ NO ejecutes herramientas
- Usuario: "¿cómo están?" → ❌ NO ejecutes herramientas
- Usuario: "quiero ver productos" → ❌ NO uses la herramienta de "crear tarea", usa la de "ver productos"
- Usuario: "quiero crear una tarea" → ❌ NO uses la herramienta de "ver productos", usa la de "crear tarea"`;
        } else {
            systemPrompt = `${baseSystemPrompt}

IMPORTANTE - CONTEXTO DEL NEGOCIO:
${businessContext}

SIEMPRE incluye el nombre del negocio (${businessName}) en tus respuestas cuando sea apropiado.`;
        }
        
        console.log(`[AI Agent ${nodeId}] Final system prompt length:`, systemPrompt.length);
    } catch (error) {
        console.error(`[AI Agent ${nodeId}] Error compiling system prompt:`, error);
        systemPrompt = 'You are a helpful assistant';
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
            aiAgentChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Credential not found');
    }

    try {
        // Build tools array ONLY if we should use them (not for simple greetings)
        const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
        const toolNodeMap = new Map<string, PrismaNode>();
        
        // Only build tools if we should use them
        if (shouldUseTools) {
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
                
                console.log(`[AI Agent ${nodeId}] Tool registered: "${toolName}" (from node "${toolNode.name}")`);
                console.log(`[AI Agent ${nodeId}] Tool description: ${toolDef.function.description.substring(0, 100)}...`);
            }
            console.log(`[AI Agent ${nodeId}] Tools built: ${tools.length} (will be passed to model)`);
            console.log(`[AI Agent ${nodeId}] Available tool names:`, Array.from(toolNodeMap.keys()));
        } else {
            console.log(`[AI Agent ${nodeId}] Tools NOT built (simple greeting detected - tools will NOT be passed to model)`);
        }
        
        console.log(`[AI Agent ${nodeId}] Model type:`, data.modelType);

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
            console.log(`[AI Agent ${nodeId}] Iteration ${iteration}/${maxIterations}`);

            // Handle different model types
            if (data.modelType === 'OPENAI') {
                const openai = new OpenAI({
                    apiKey: decrypt(credential.value),
                });

                const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
                    model: 'gpt-4o-mini',
                    messages: messages,
                    temperature: 0.7,
                };

                // Add tools ONLY if we should use them (not for simple greetings)
                // CRITICAL: Never pass tools to the model if it's a simple greeting
                if (shouldUseTools && tools.length > 0) {
                    requestOptions.tools = tools;
                    requestOptions.tool_choice = 'auto';
                    console.log(`[AI Agent ${nodeId}] Iteration ${iteration}: Using ${tools.length} tools`);
                } else {
                    // Explicitly do NOT include tools in the request
                    // This prevents the model from even seeing the tools
                    console.log(`[AI Agent ${nodeId}] Iteration ${iteration}: NOT using tools (simple greeting or no tools)`);
                    console.log(`[AI Agent ${nodeId}] User prompt normalized: "${userPrompt.trim().replace(/[\s\n\r\t]+/g, '').toLowerCase()}"`);
                }

                const response = await step.run(
                    `ai-agent-openai-${iteration}`,
                    async () => {
                        return await openai.chat.completions.create(requestOptions);
                    }
                );

                const choice = response.choices[0];
                if (!choice || !choice.message) {
                    throw new NonRetriableError('No response from OpenAI');
                }

                const assistantMessage = choice.message;
                const toolCalls = assistantMessage.tool_calls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | undefined;

                messages.push({
                    role: 'assistant',
                    content: assistantMessage.content || null,
                    tool_calls: toolCalls,
                });

                if (toolCalls && toolCalls.length > 0) {
                    // CRITICAL: If this is a simple greeting, DO NOT execute tools even if model requests them
                    if (isSimpleGreeting(userPrompt)) {
                        console.warn(`[AI Agent ${nodeId}] ⚠️ BLOCKED: Model requested ${toolCalls.length} tool call(s) but user message is a simple greeting. Ignoring tool calls.`);
                        console.warn(`[AI Agent ${nodeId}] User prompt: "${userPrompt}"`);
                        // Remove tool calls from message and continue with text response only
                        messages.pop(); // Remove the assistant message with tool calls
                        messages.push({
                            role: 'assistant',
                            content: assistantMessage.content || '¡Hola! ¿En qué puedo ayudarte?',
                            tool_calls: undefined,
                        });
                        finalText = assistantMessage.content || '¡Hola! ¿En qué puedo ayudarte?';
                        break; // Exit loop, we have the final response
                    }
                    
                    console.log(`[AI Agent ${nodeId}] Model requested ${toolCalls.length} tool call(s)`);
                    console.log(`[AI Agent ${nodeId}] Available tools in map:`, Array.from(toolNodeMap.keys()));
                    
                    for (const toolCall of toolCalls) {
                        if (toolCall.type !== 'function') {
                            console.warn(`[AI Agent ${nodeId}] Skipping non-function tool call: ${toolCall.type}`);
                            continue;
                        }
                        
                        const toolName = toolCall.function.name;
                        const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
                        
                        console.log(`[AI Agent ${nodeId}] ===== TOOL CALL =====`);
                        console.log(`[AI Agent ${nodeId}] Tool name requested: "${toolName}"`);
                        console.log(`[AI Agent ${nodeId}] Tool arguments:`, toolArgs);
                        console.log(`[AI Agent ${nodeId}] User prompt: "${userPrompt}"`);
                        
                        const toolNode = toolNodeMap.get(toolName);
                        if (!toolNode) {
                            console.error(`[AI Agent ${nodeId}] ❌ ERROR: Tool node not found for: "${toolName}"`);
                            console.error(`[AI Agent ${nodeId}] Available tools:`, Array.from(toolNodeMap.keys()));
                            messages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                content: JSON.stringify({ error: `Tool ${toolName} not found. Available tools: ${Array.from(toolNodeMap.keys()).join(', ')}` }),
                            });
                            continue;
                        }

                        console.log(`[AI Agent ${nodeId}] ✅ Tool node found: "${toolNode.name}" (type: ${toolNode.type})`);
                        console.log(`[AI Agent ${nodeId}] ====================`);

                        try {
                            // Merge tool arguments into context so they're available for Handlebars templates
                            // For tarea creation, map titulo/descripcion to the context
                            const toolContext = { ...currentContext };
                            
                            // If this is a tarea creation tool, structure the args properly
                            if (toolNode.type === 'HTTP_REQUEST') {
                                const toolData = toolNode.data as { endpoint?: string; method?: string; body?: string };
                                const endpoint = toolData.endpoint || '';
                                
                                if (endpoint.includes('tareas') || endpoint.includes('tasks')) {
                                    // For tarea creation, pass titulo and descripcion directly to context
                                    if (toolArgs.titulo) {
                                        toolContext.titulo = toolArgs.titulo;
                                    }
                                    if (toolArgs.descripcion) {
                                        toolContext.descripcion = toolArgs.descripcion;
                                    }
                                    // Also add them as a structured object for JSON body
                                    toolContext.tarea = {
                                        titulo: toolArgs.titulo || '',
                                        descripcion: toolArgs.descripcion || '',
                                    };
                                } else {
                                    // For other HTTP requests, merge all args
                                    Object.assign(toolContext, toolArgs);
                                }
                            } else {
                                // For other tool types, merge all args
                                Object.assign(toolContext, toolArgs);
                            }
                            
                            const toolResult = await executeToolNode(
                                toolNode,
                                toolContext,
                                userId,
                                step,
                                publish,
                                workflow!
                            );

                            const toolData = toolNode.data as { variableName?: string };
                            const varName = toolData?.variableName || toolName;
                            const resultValue = toolResult[varName] || toolResult;

                            currentContext = { ...currentContext, ...toolResult };

                            const toolResultContent = typeof resultValue === 'string' 
                                ? resultValue 
                                : JSON.stringify(resultValue);
                            
                            messages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                content: toolResultContent,
                            });

                            console.log(`[AI Agent ${nodeId}] Tool ${toolName} executed successfully`);
                        } catch (error) {
                            console.error(`[AI Agent ${nodeId}] Error executing tool ${toolName}:`, error);
                            messages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                content: JSON.stringify({ 
                                    error: `Error executing tool: ${error instanceof Error ? error.message : String(error)}` 
                                }),
                            });
                        }
                    }

                    continue;
                }

                finalText = assistantMessage.content || '';
                console.log(`[AI Agent ${nodeId}] Final response received (no more tool calls)`);
                break;
            } else if (data.modelType === 'ANTHROPIC') {
                // Anthropic doesn't support tools in the same way, so we'll use a simpler approach
                const anthropic = new Anthropic({
                    apiKey: decrypt(credential.value),
                });

                const response = await step.run(
                    `ai-agent-anthropic-${iteration}`,
                    async () => {
                        return await anthropic.messages.create({
                            model: 'claude-3-5-sonnet-20241022',
                            max_tokens: 1024,
                            system: systemPrompt,
                            messages: [
                                {
                                    role: 'user',
                                    content: userPrompt,
                                },
                            ],
                        });
                    }
                );

                const text = response.content[0].type === 'text' ? response.content[0].text : '';
                finalText = text;
                break;
            } else if (data.modelType === 'GEMINI') {
                // Gemini also has different tool support
                const genAI = new GoogleGenerativeAI(decrypt(credential.value));
                const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

                const response = await step.run(
                    `ai-agent-gemini-${iteration}`,
                    async () => {
                        const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
                        return result.response;
                    }
                );

                // Extract text from Gemini response
                const candidate = response.candidates?.[0];
                const part = candidate?.content?.parts?.[0];
                finalText = (part && 'text' in part) ? part.text : '';
                break;
            }
        }

        // If we reached max iterations without final answer
        if (!finalText && iteration >= maxIterations) {
            console.warn(`[AI Agent ${nodeId}] Max iterations reached, using last message content`);
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
            aiAgentChannel().status({
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
            aiAgentChannel().status({
                nodeId,
                status: 'error',
            }),
        );

        throw error;
    }
};

