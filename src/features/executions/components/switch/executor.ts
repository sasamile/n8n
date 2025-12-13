import Handlebars from 'handlebars';
import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { switchChannel } from '@/inngest/channels/switch';

Handlebars.registerHelper('json', (context) => {
    const jsonString = JSON.stringify(context, null, 2);
    const safeString = new Handlebars.SafeString(jsonString);
    return safeString;
});

type SwitchData = {
    variableName?: string;
    condition?: string; // Legacy support
    cases?: Array<{ condition: string; label?: string }>;
};

// Helper function to clean spaces inside Handlebars variables
function cleanHandlebarsTemplate(template: string): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, content) => {
        const cleaned = content.trim().replace(/\s*\.\s*/g, '.').replace(/\s+/g, '');
        return `{{${cleaned}}}`;
    });
}

export const switchExecutor: NodeExecutor<SwitchData> = async ({
    data,
    nodeId,
    context,
    step,
    publish,
}) => {
    await publish(
        switchChannel().status({
            nodeId,
            status: 'loading',
        }),
    );

    if (!data.variableName) {
        await publish(
            switchChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Switch node: Variable name is missing');
    }

    // Support both old format (single condition) and new format (cases array)
    const cases = data.cases || (data.condition ? [{ condition: data.condition }] : []);
    
    if (cases.length === 0) {
        await publish(
            switchChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Switch node: At least one case is required');
    }

    try {
        const result = await step.run('switch-evaluation', async () => {
            // Helper function to replace Handlebars variables with actual values
            function replaceVariables(expression: string): string {
                return expression.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
                    const cleanPath = path.trim().replace(/\s*\.\s*/g, '.');
                    const keys = cleanPath.split('.');
                    let value: any = context;
                    
                    for (const key of keys) {
                        if (value == null) {
                            return 'undefined';
                        }
                        value = value[key];
                    }
                    
                    // Convert to appropriate JavaScript representation
                    if (value === null) return 'null';
                    if (value === undefined) return 'undefined';
                    if (typeof value === 'boolean') return String(value);
                    if (typeof value === 'number') return String(value);
                    if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`;
                    return JSON.stringify(value);
                });
            }

            // Helper function to parse values
            function parseValue(str: string): any {
                const trimmed = str.trim();
                if (trimmed === 'true') return true;
                if (trimmed === 'false') return false;
                if (trimmed === 'null') return null;
                if (trimmed === 'undefined') return undefined;
                if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
                    return trimmed.slice(1, -1);
                }
                if (!isNaN(Number(trimmed))) {
                    return Number(trimmed);
                }
                return trimmed;
            }

            // Helper function to evaluate a single condition
            function evaluateCondition(condition: string): boolean {
                let conditionExpression = replaceVariables(condition);
                const trimmed = conditionExpression.trim();
                
                console.log(`[Switch ${nodeId}] Evaluating condition: "${condition}" -> "${trimmed}"`);
                console.log(`[Switch ${nodeId}] Includes ===: ${trimmed.includes('===')}, Includes ==: ${trimmed.includes('==')}`);
                
                // Check if it's a simple expression
                let hasOperator = /(===|!==|==|!=|>=|<=|>|<|&&|\|\|)/.test(trimmed);
                
                // Handle direct boolean values
                if (!hasOperator) {
                    if (trimmed === 'true') return true;
                    if (trimmed === 'false') return false;
                    hasOperator = true;
                }
                
                if (hasOperator) {
                    // Try manual parsing FIRST before normalizing (to avoid breaking === into == =)
                    // Check for === first (before ==) to avoid matching == inside ===
                    if (trimmed.includes('===')) {
                        // Split directly on === without normalizing first
                        const parts = trimmed.split('===').map(p => p.trim());
                        console.log(`[Switch ${nodeId}] Manual parsing (===): split result:`, parts);
                        if (parts.length === 2) {
                            const left = parseValue(parts[0]);
                            const right = parseValue(parts[1]);
                            console.log(`[Switch ${nodeId}] Parsed values: "${parts[0]}" -> ${JSON.stringify(left)} (${typeof left}), "${parts[1]}" -> ${JSON.stringify(right)} (${typeof right})`);
                            const result = left === right;
                            console.log(`[Switch ${nodeId}] Comparison: ${JSON.stringify(left)} === ${JSON.stringify(right)} = ${result}`);
                            return result;
                        }
                    } else if (trimmed.includes('!==')) {
                        // Split directly on !==
                        const parts = trimmed.split('!==').map(p => p.trim());
                        console.log(`[Switch ${nodeId}] Manual parsing (!==): split result:`, parts);
                        if (parts.length === 2) {
                            const left = parseValue(parts[0]);
                            const right = parseValue(parts[1]);
                            const result = left !== right;
                            console.log(`[Switch ${nodeId}] Comparison: ${JSON.stringify(left)} !== ${JSON.stringify(right)} = ${result}`);
                            return result;
                        }
                    } else if (trimmed.includes('==') && !trimmed.includes('===')) {
                        // Only process == if it's not part of ===
                        const parts = trimmed.split('==').map(p => p.trim());
                        console.log(`[Switch ${nodeId}] Manual parsing (==): split result:`, parts);
                        if (parts.length === 2) {
                            const left = parseValue(parts[0]);
                            const right = parseValue(parts[1]);
                            const result = left == right;
                            console.log(`[Switch ${nodeId}] Comparison: ${JSON.stringify(left)} == ${JSON.stringify(right)} = ${result}`);
                            return result;
                        }
                    } else if (trimmed.includes('!=') && !trimmed.includes('!==')) {
                        // Only process != if it's not part of !==
                        const parts = trimmed.split('!=').map(p => p.trim());
                        console.log(`[Switch ${nodeId}] Manual parsing (!=): split result:`, parts);
                        if (parts.length === 2) {
                            const left = parseValue(parts[0]);
                            const right = parseValue(parts[1]);
                            const result = left != right;
                            console.log(`[Switch ${nodeId}] Comparison: ${JSON.stringify(left)} != ${JSON.stringify(right)} = ${result}`);
                            return result;
                        }
                    }
                    
                    // If manual parsing didn't work, normalize and use Function evaluation
                    let safeExpression = trimmed
                        // First normalize all whitespace to single spaces
                        .replace(/\s+/g, ' ')
                        // Then normalize operators (longer ones first!)
                        .replace(/\s*===\s*/g, ' === ')
                        .replace(/\s*!==\s*/g, ' !== ')
                        .replace(/\s*>=\s*/g, ' >= ')
                        .replace(/\s*<=\s*/g, ' <= ')
                        .replace(/\s*==\s*/g, ' == ')
                        .replace(/\s*!=\s*/g, ' != ')
                        .replace(/\s*&&\s*/g, ' && ')
                        .replace(/\s*\|\|\s*/g, ' || ')
                        .replace(/\s*>\s*/g, ' > ')
                        .replace(/\s*<\s*/g, ' < ')
                        // Final cleanup
                        .replace(/\s+/g, ' ')
                        .trim();
                    
                    // For complex expressions, use Function evaluation as fallback
                    console.log(`[Switch ${nodeId}] No simple comparison found, using Function evaluation for: "${safeExpression}"`);
                    try {
                        const wrappedExpression = `(${safeExpression})`;
                        const evalFunction = new Function(`return ${wrappedExpression}`);
                        const result = Boolean(evalFunction());
                        console.log(`[Switch ${nodeId}] Function evaluation result: ${result}`);
                        return result;
                    } catch (evalErr) {
                        console.error(`[Switch ${nodeId}] Evaluation error for condition "${condition}":`, evalErr);
                        throw new NonRetriableError(
                            `Switch node: Failed to evaluate condition "${condition}". Error: ${evalErr instanceof Error ? evalErr.message : String(evalErr)}`
                        );
                    }
                }
                
                return false;
            }

            // Evaluate each case in order until one matches
            let matchedCaseIndex = -1;
            const evaluatedConditions: string[] = [];
            
            for (let i = 0; i < cases.length; i++) {
                const caseItem = cases[i];
                const conditionExpression = replaceVariables(caseItem.condition);
                evaluatedConditions.push(conditionExpression);
                
                console.log(`[Switch ${nodeId}] Evaluating case ${i}: "${caseItem.condition}" -> "${conditionExpression}"`);
                
                try {
                    const result = evaluateCondition(caseItem.condition);
                    console.log(`[Switch ${nodeId}] Case ${i} evaluation result: ${result} (type: ${typeof result})`);
                    
                    if (result === true) {
                        matchedCaseIndex = i;
                        console.log(`[Switch ${nodeId}] Case ${i} matched! Setting matchedCaseIndex to ${i}`);
                        break;
                    } else {
                        console.log(`[Switch ${nodeId}] Case ${i} did not match (result was ${result}), continuing to next case`);
                    }
                } catch (error) {
                    console.error(`[Switch ${nodeId}] Error evaluating case ${i}:`, error);
                    throw error;
                }
            }

            const responsePayload = {
                result: matchedCaseIndex, // -1 if no case matched (default case)
                matchedCase: matchedCaseIndex >= 0 ? cases[matchedCaseIndex] : null,
                evaluatedConditions,
                cases: cases.map((c, i) => ({
                    condition: c.condition,
                    label: c.label || `Case ${i}`,
                    matched: i === matchedCaseIndex,
                })),
            };

            console.log(`[Switch ${nodeId}] Final result: case index ${matchedCaseIndex}`);

            return {
                ...context,
                [data.variableName]: responsePayload,
            };
        });

        await publish(
            switchChannel().status({
                nodeId,
                status: 'success',
            }),
        );

        return result;
    } catch (error) {
        await publish(
            switchChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError(
            `Switch node: Failed to evaluate condition: ${error instanceof Error ? error.message : String(error)}`
        );
    }
};






