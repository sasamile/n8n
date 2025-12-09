import Handlebars from 'handlebars';
import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import ky, { type Options as KyOptions } from "ky";
import { httpRequestChannel } from '../../../../inngest/channels/http-request';

Handlebars.registerHelper('json', (context) => {
    const jsonString = JSON.stringify(context, null, 2);
    const safeString = new Handlebars.SafeString(jsonString);
    return safeString;
});

// Helper to safely access nested properties
Handlebars.registerHelper('get', function(obj: any, path: string) {
    if (!obj || !path) return '';
    const keys = path.split('.');
    let result = obj;
    for (const key of keys) {
        if (result == null) return '';
        result = result[key];
    }
    return result != null ? result : '';
});

// Helper function to clean spaces inside Handlebars variables
// Converts {{variable. path. property}} to {{variable.path.property}}
function cleanHandlebarsTemplate(template: string): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, content) => {
        // Remove spaces around dots and clean up the variable path
        const cleaned = content.trim().replace(/\s*\.\s*/g, '.').replace(/\s+/g, '');
        return `{{${cleaned}}}`;
    });
}

type HttpRequestData = {
    variableName?: string;
    endpoint?: string;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: string;
    headers?: string;
};

export const httpRequestExecutor: NodeExecutor<HttpRequestData> = async ({
    data,
    nodeId,
    context,
    step,
    publish,
}) => {
    // Publish 'loading' state for http request
    await publish(
        httpRequestChannel().status({
            nodeId,
            status: 'loading',
        }),
    );
 

    try {
        const result = await step.run('http-request', async () => {

            if (!data.endpoint) {
                // Publish 'error' state for http request
                await publish(
                    httpRequestChannel().status({
                        nodeId,
                        status: 'error',
                    }),
                );
        
                throw new NonRetriableError('HTTP Request node: No endpoint configured');
            };
        
            if (!data.variableName) {
                // Publish 'error' state for http request
                await publish(
                    httpRequestChannel().status({
                        nodeId,
                        status: 'error',
                    }),
                );
        
                throw new NonRetriableError('Variable name not configured');
            }
        
            if (!data.method) {
                // Publish 'error' state for http request
                await publish(
                    httpRequestChannel().status({
                        nodeId,
                        status: 'error',
                    }),
                );
        
                throw new NonRetriableError('Method not configured');
            }
        
            // Compile endpoint with Handlebars, handling potential errors
            let endpoint: string;
            try {
                const cleanedEndpoint = cleanHandlebarsTemplate(data.endpoint);
                const template = Handlebars.compile(cleanedEndpoint);
                endpoint = template(context);
            } catch (error) {
                await publish(
                    httpRequestChannel().status({
                        nodeId,
                        status: 'error',
                    }),
                );
                throw new NonRetriableError(`HTTP Request node: Failed to compile endpoint template: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            // Validate endpoint is a valid URL
            if (!endpoint || typeof endpoint !== 'string') {
                await publish(
                    httpRequestChannel().status({
                        nodeId,
                        status: 'error',
                    }),
                );
                throw new NonRetriableError('HTTP Request node: Invalid endpoint after template compilation');
            }
            
            const method = data.method;

            let customHeaders: Record<string, string> | undefined;
            if (data.headers) {
                try {
                    const cleanedHeaders = cleanHandlebarsTemplate(data.headers);
                    const headersTemplate = Handlebars.compile(cleanedHeaders);
                    const renderedHeaders = headersTemplate(context);
                    const parsed = JSON.parse(renderedHeaders);
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                        throw new Error('Headers JSON debe ser un objeto con pares clave/valor');
                    }
                    customHeaders = Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
                        acc[String(key)] = String(value);
                        return acc;
                    }, {});
                } catch (error) {
                    await publish(
                        httpRequestChannel().status({
                            nodeId,
                            status: 'error',
                        }),
                    );
                    throw new NonRetriableError(`HTTP Request node: Headers inválidos: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            const options: KyOptions = { method };

            if (['POST', 'PUT', 'PATCH'].includes(method)) {
                let resolved: string;
                try {
                    const cleanedBody = cleanHandlebarsTemplate(data.body || '{}');
                    const bodyTemplate = Handlebars.compile(cleanedBody);
                    resolved = bodyTemplate(context);
                } catch (error) {
                    await publish(
                        httpRequestChannel().status({
                            nodeId,
                            status: 'error',
                        }),
                    );
                    throw new NonRetriableError(`HTTP Request node: Failed to compile body template: ${error instanceof Error ? error.message : String(error)}`);
                }
                
                // Validate JSON if body is provided
                if (data.body) {
                    try {
                JSON.parse(resolved);
                    } catch (parseError) {
                        await publish(
                            httpRequestChannel().status({
                                nodeId,
                                status: 'error',
                            }),
                        );
                        throw new NonRetriableError(`HTTP Request node: Body is not valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
                    }
                }
                
                options.body = resolved;
                options.headers = {
                    ...(customHeaders || {}),
                    'Content-Type': customHeaders?.['Content-Type'] || 'application/json',
                };
            } else if (customHeaders) {
                options.headers = customHeaders;
            }

            const response = await ky(endpoint, options);
            const contentType = response.headers.get('content-type');
            const responseData = contentType?.includes('application/json')
                ? await response.json()
                : await response.text();
            const responsePayload = {
                httpResponse: {
                    status: response.status,
                    statusText: response.statusText,
                    data: responseData,
                },
            };

            return {
                ...context,
                [data.variableName]: responsePayload,
            };
        });
        
        await publish(
            httpRequestChannel().status({
                nodeId,
                status: 'success',
            }),
        );
        return result;
    } catch (error) {
        await publish(
            httpRequestChannel().status({
                nodeId,
                status: 'error',
            }));

        throw error;

    }

};