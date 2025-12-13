import Handlebars from 'handlebars';
import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import OpenAI from 'openai';
import { imageToTextChannel } from '@/inngest/channels/image-to-text';
import prisma from '@/lib/db';
import { decrypt } from '@/lib/encryption';

Handlebars.registerHelper('json', (context) => {
    const jsonString = JSON.stringify(context, null, 2);
    const safeString = new Handlebars.SafeString(jsonString);
    return safeString;
});

// Helper function to clean spaces inside Handlebars variables
function cleanHandlebarsTemplate(template: string): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, content) => {
        const cleaned = content.trim().replace(/\s*\.\s*/g, '.').replace(/\s+/g, '');
        return `{{${cleaned}}}`;
    });
}

type ImageToTextData = {
    variableName?: string;
    credentialId?: string;
    imageUrl?: string;
    prompt?: string;
};

export const imageToTextExecutor: NodeExecutor<ImageToTextData> = async ({
    data,
    nodeId,
    userId,
    context,
    step,
    publish,
}) => {
    await publish(
        imageToTextChannel().status({
            nodeId,
            status: 'loading',
        }),
    );

    if (!data.variableName) {
        await publish(
            imageToTextChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Image to Text node: Variable name is missing');
    }

    if (!data.credentialId) {
        await publish(
            imageToTextChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Image to Text node: Credential is required');
    }

    if (!data.imageUrl) {
        await publish(
            imageToTextChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Image to Text node: Image URL is required');
    }

    try {
        // Step 1: Compile image URL with Handlebars
        const imageUrl = await step.run('compile-url', async () => {
            try {
                const cleanedUrl = cleanHandlebarsTemplate(data.imageUrl);
                const template = Handlebars.compile(cleanedUrl);
                let url = template(context);
                
                // Decode URL if it's encoded
                try {
                    url = decodeURIComponent(url);
                } catch {
                    // If decoding fails, use original URL
                }
                
                if (!url || typeof url !== 'string') {
                    throw new NonRetriableError('Image to Text node: Invalid image URL after template compilation');
                }
                
                // Validate URL format
                try {
                    new URL(url);
                } catch {
                    throw new NonRetriableError('Image to Text node: Invalid URL format');
                }
                
                console.log(`[ImageToText ${nodeId}] Image URL compiled: ${url.substring(0, 100)}...`);
                return url;
            } catch (error) {
                throw new NonRetriableError(`Image to Text node: Failed to compile image URL template: ${error instanceof Error ? error.message : String(error)}`);
            }
        });

        // Step 2: Compile prompt if provided
        const prompt = await step.run('compile-prompt', async () => {
            let compiledPrompt = data.prompt || "What's in this image? Describe it in detail.";
            try {
                const cleanedPrompt = cleanHandlebarsTemplate(compiledPrompt);
                const promptTemplate = Handlebars.compile(cleanedPrompt);
                compiledPrompt = promptTemplate(context);
            } catch (error) {
                // If prompt compilation fails, use original
                console.warn(`[ImageToText ${nodeId}] Failed to compile prompt, using original:`, error);
            }
            return compiledPrompt;
        });

        // Step 3: Get credential
        const credential = await step.run('get-credential', async () => {
            const cred = await prisma.credential.findUnique({
                where: {
                    id: data.credentialId,
                    userId,
                },
            });
            
            if (!cred) {
                throw new NonRetriableError('Image to Text node: Credential not found');
            }
            
            return cred;
        });

        const openai = new OpenAI({
            apiKey: decrypt(credential.value),
        });

        // Step 4: Call OpenAI Vision API
        const response = await step.run('openai-vision', async () => {
            console.log(`[ImageToText ${nodeId}] Calling OpenAI Vision API with model: gpt-4o`);
            try {
                const result = await openai.chat.completions.create({
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: prompt,
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: imageUrl,
                                    },
                                },
                            ],
                        },
                    ],
                    max_tokens: 1000,
                }, {
                    timeout: 120000, // 2 minutes timeout for large images
                });
                
                console.log(`[ImageToText ${nodeId}] OpenAI Vision API response received`);
                return result;
            } catch (error) {
                if (error instanceof Error) {
                    if (error.message.includes('timeout')) {
                        throw new NonRetriableError('Image to Text node: Request timeout. The image may be too large or the API is taking too long.');
                    }
                    if (error.message.includes('invalid_image') || error.message.includes('unsupported')) {
                        throw new NonRetriableError('Image to Text node: Invalid image format or URL. Please ensure the image URL is accessible and in a supported format (JPEG, PNG, GIF, WebP).');
                    }
                }
                throw error;
            }
        });

        const text = response.choices[0]?.message?.content || '';
        
        if (!text) {
            throw new NonRetriableError('Image to Text node: No text was returned from OpenAI Vision API');
        }

        console.log(`[ImageToText ${nodeId}] Transcription completed, text length: ${text.length} characters`);

        const responsePayload = {
            text,
            imageUrl,
            prompt: data.prompt || "What's in this image? Describe it in detail.",
        };

        const result = {
            ...context,
            [data.variableName]: responsePayload,
        };

        await publish(
            imageToTextChannel().status({
                nodeId,
                status: 'success',
            }),
        );

        return result;
    } catch (error) {
        await publish(
            imageToTextChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError(
            `Image to Text node: ${error instanceof Error ? error.message : String(error)}`
        );
    }
};






