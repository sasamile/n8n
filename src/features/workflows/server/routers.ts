import prisma from "@/lib/db";
import { generateSlug } from 'random-word-slugs';
import { createTRPCRouter,  protectedProcedure } from "@/trpc/init";
import z from "zod";
import { PAGINATION } from "@/config/constants";
import { NodeType } from "@/generated/prisma";
import type { Edge, Node } from '@xyflow/react';
import { inngest } from "@/inngest/client";
import { sendWorkflowExecution } from "@/inngest/utils";

export const workflowsRouter = createTRPCRouter({
    execute: protectedProcedure
    .input(z.object({ id: z.string()}))
    .mutation(async ({ input, ctx}) => {
        const workflow = await prisma.workflow.findUniqueOrThrow({
            where: {
                id: input.id,
                userId: ctx.auth.user.id,
            },
        });


        await sendWorkflowExecution({
            workflowId: input.id,
        });

        return workflow;
    }),
    create: protectedProcedure.mutation(({ ctx }) => {
        return prisma.workflow.create({
            data: {
                name: generateSlug(3),
                userId: ctx.auth.user.id,
                nodes: {
                    create: {
                        type: NodeType.INITIAL,
                        position: {x: 0, y: 0},
                        name: NodeType.INITIAL,
                    },
                },
            },
        });
    }),
    remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
        return prisma.workflow.delete({
            where: {
                id: input.id,
                userId: ctx.auth.user.id,
            },
        })
    }),
    update: protectedProcedure
        .input(
            z.object({
                id: z.string(),
                nodes: z.array(
                    z.object({
                        id: z.string(),
                        type: z.nativeEnum(NodeType),
                        position: z.object({ x: z.number(), y: z.number() }),
                        data: z.record(z.string(), z.any()).optional(),
                    }),
                ),
                edges: z.array(
                    z.object({
                        source: z.string(),
                        target: z.string(),
                        sourceHandle: z.string().nullish(),
                        targetHandle: z.string().nullish(),
                    })
                ),
            })
        )
    .mutation(async ({ ctx, input }) => {
        const { id, nodes, edges } = input;

        const workflow = await prisma.workflow.findUniqueOrThrow({
            where: { id, userId: ctx.auth.user.id },
        })

        //Transaction to ensure all nodes and connections are deleted before creating new ones
        return await prisma.$transaction(async (tx) => {
            //Delete all existing nodes and connections ( cascade deletes connections)
            await tx.node.deleteMany({
                where: {workflowId: id},
            });

            //Create nodes
            // Prisma requires the exact enum value - map strings to enum values explicitly
            const nodesToCreate = nodes.map((node) => {
                if (!node.type) {
                    throw new Error('Node type is required');
                }
                
                const typeStr = String(node.type);
                let nodeType: NodeType;
                
                // Map each string to the corresponding NodeType enum value
                // This ensures Prisma receives the exact enum type it expects
                switch (typeStr) {
                    case 'INITIAL':
                        nodeType = NodeType.INITIAL;
                        break;
                    case 'MANUAL_TRIGGER':
                        nodeType = NodeType.MANUAL_TRIGGER;
                        break;
                    case 'HTTP_REQUEST':
                        nodeType = NodeType.HTTP_REQUEST;
                        break;
                    case 'GOOGLE_FORM_TRIGGER':
                        nodeType = NodeType.GOOGLE_FORM_TRIGGER;
                        break;
                    case 'STRIPE_TRIGGER':
                        nodeType = NodeType.STRIPE_TRIGGER;
                        break;
                    case 'ANTHROPIC':
                        nodeType = NodeType.ANTHROPIC;
                        break;
                    case 'GEMINI':
                        nodeType = NodeType.GEMINI;
                        break;
                    case 'OPENAI':
                        nodeType = NodeType.OPENAI;
                        break;
                    case 'DISCORD':
                        nodeType = NodeType.DISCORD;
                        break;
                    case 'SLACK':
                        nodeType = NodeType.SLACK;
                        break;
                    case 'WEBHOOK_TRIGGER':
                        nodeType = NodeType.WEBHOOK_TRIGGER;
                        break;
                    case 'REDIS':
                        nodeType = NodeType.REDIS;
                        break;
                    case 'POSTGRESQL':
                        nodeType = NodeType.POSTGRESQL;
                        break;
                    case 'BOT_ROUTER':
                        nodeType = NodeType.BOT_ROUTER;
                        break;
                    case 'AI_AGENT':
                        nodeType = NodeType.AI_AGENT;
                        break;
                    default:
                        throw new Error(`Invalid node type: ${typeStr}`);
                }
                
                return {
                    id: node.id,
                    workflowId: id,
                    name: typeStr,
                    type: nodeType,
                    position: node.position,
                    data: node.data || {},
                };
            });
            
            // Use createMany - Prisma should accept the enum values correctly
            await tx.node.createMany({
                data: nodesToCreate,
            });

            // Validate that all edges reference existing nodes
            const nodeIds = new Set(nodesToCreate.map(n => n.id));
            const validEdges = edges.filter(edge => {
                const sourceExists = nodeIds.has(edge.source);
                const targetExists = nodeIds.has(edge.target);
                
                if (!sourceExists) {
                    console.error(`[Workflow Update] Edge source node not found: ${edge.source}`);
                }
                if (!targetExists) {
                    console.error(`[Workflow Update] Edge target node not found: ${edge.target}`);
                }
                
                return sourceExists && targetExists;
            });

            if (validEdges.length !== edges.length) {
                const invalidCount = edges.length - validEdges.length;
                console.warn(`[Workflow Update] Filtered out ${invalidCount} invalid edge(s) that reference non-existent nodes`);
            }

            //Create connections only for valid edges
            if (validEdges.length > 0) {
                await tx.connection.createMany({
                    data: validEdges.map((edge) => ({
                        workflowId: id,
                        fromNodeId: edge.source,
                        toNodeId: edge.target,
                        fromOutput: edge.sourceHandle || 'main',
                        toInput: edge.targetHandle || 'main',
                    })),
                });
            }

            //Update workflow updateAt timestamp
            await tx.workflow.update({
                where: { id },
                data: { updatedAt: new Date()}
            });

            return workflow;
        })
    }),
    updateName: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
        return prisma.workflow.update({
            where: {
                id: input.id,
                userId: ctx.auth.user.id
            },
            data: {
                name: input.name,
            },
        });
    }),
    getOne: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ ctx, input }) => {
            const workflow = await prisma.workflow.findUniqueOrThrow({
                where: {
                    id: input.id,
                    userId: ctx.auth.user.id
                },
                include: {
                    nodes: true,
                    connections: true,
                },
            });

            //Transform server nodes to react-flow compatible nodes
            const nodes: Node[] = workflow.nodes.map((node) => ({
                id: node.id,
                type: node.type,
                position: node.position as { x: number, y: number },
                data: (node.data as Record<string, unknown>) || {},                
            }));

            //Transform server connections to react-flow compatible edges
            const edges: Edge[] = workflow.connections.map((connection) => ({
                id: connection.id,
                source: connection.fromNodeId,
                target: connection.toNodeId,
                sourceHandle: connection.fromOutput,
                targetHandle: connection.toInput,
            }));

            return {
                id: workflow.id,
                name: workflow.name,
                nodes,
                edges,
            };
        }),
    getMany: protectedProcedure
        .input(z.object({
            page: z.number().default(PAGINATION.DEFAULT_PAGE),
            pageSize: z
                .number()
                .min(PAGINATION.MIN_PAGE_SIZE)
                .max(PAGINATION.MAX_PAGE_SIZE)
                .default(PAGINATION.DEFAULT_PAGE_SIZE),
            search: z.string().default(''),
        }))
        .query(async ({ ctx, input }) => {
            const { page, pageSize, search } = input;

            const [items, totalCount] = await Promise.all([
                prisma.workflow.findMany({
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                    where: {
                        userId: ctx.auth.user.id,
                        name: {
                            contains: search,
                            mode: 'insensitive',
                        }
                    },
                    orderBy: {
                        updatedAt: 'desc',
                    }
                }),
                prisma.workflow.count({
                    where: {
                        userId: ctx.auth.user.id,
                        name: {
                            contains: search,
                            mode: 'insensitive',
                        }
                    }
                })
            ]);

            const totalPages = Math.ceil(totalCount / pageSize);
            const hasNextPage = page < totalPages;
            const hasPreviousPage = page > 1;

            return {
                items,
                page,
                pageSize,
                totalCount,
                totalPages,
                hasNextPage,
                hasPreviousPage,
            };

        }),    
    })