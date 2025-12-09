import Handlebars from 'handlebars';
import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { redisChannel } from '@/inngest/channels/redis';
import prisma from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import Redis from 'ioredis';

Handlebars.registerHelper('json', (context) => {
    const jsonString = JSON.stringify(context, null, 2);
    const safeString = new Handlebars.SafeString(jsonString);
    return safeString;
});

type RedisData = {
    variableName?: string;
    credentialId?: string;
    operation?: "GET" | "SET" | "DELETE" | "INCR" | "DECR" | "EXISTS";
    key?: string;
    value?: string;
};

export const redisExecutor: NodeExecutor<RedisData> = async ({
    data,
    nodeId,
    userId,
    context,
    step,
    publish,
}) => {
    await publish(
        redisChannel().status({
            nodeId,
            status: 'loading',
        }),
    );

    if (!data.variableName) {
        await publish(
            redisChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Redis node: Variable name is missing');
    }

    if (!data.credentialId) {
        await publish(
            redisChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Redis node: Credential is required');
    }

    if (!data.operation) {
        await publish(
            redisChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Redis node: Operation is required');
    }

    if (!data.key) {
        await publish(
            redisChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Redis node: Key is required');
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
            redisChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Credential not found');
    }

    try {
        const connectionString = decrypt(credential.value);
        const redis = new Redis(connectionString);

        const compiledKey = Handlebars.compile(data.key)(context);
        let result: any;

        switch (data.operation) {
            case 'GET':
                result = await redis.get(compiledKey);
                break;
            case 'SET':
                if (!data.value) {
                    throw new NonRetriableError('Redis SET operation requires a value');
                }
                const compiledValue = Handlebars.compile(data.value)(context);
                result = await redis.set(compiledKey, compiledValue);
                break;
            case 'DELETE':
                result = await redis.del(compiledKey);
                break;
            case 'INCR':
                result = await redis.incr(compiledKey);
                break;
            case 'DECR':
                result = await redis.decr(compiledKey);
                break;
            case 'EXISTS':
                result = await redis.exists(compiledKey);
                break;
        }

        await redis.quit();

        await publish(
            redisChannel().status({
                nodeId,
                status: 'success',
            }),
        );

        return {
            ...context,
            [data.variableName]: {
                result,
                operation: data.operation,
                key: compiledKey,
            },
        };
    } catch (error) {
        await publish(
            redisChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw error;
    }
};

