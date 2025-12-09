import Handlebars from 'handlebars';
import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { postgresqlChannel } from '@/inngest/channels/postgresql';
import prisma from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { Client } from 'pg';

Handlebars.registerHelper('json', (context) => {
    const jsonString = JSON.stringify(context, null, 2);
    const safeString = new Handlebars.SafeString(jsonString);
    return safeString;
});

type PostgreSQLData = {
    variableName?: string;
    credentialId?: string;
    query?: string;
};

export const postgresqlExecutor: NodeExecutor<PostgreSQLData> = async ({
    data,
    nodeId,
    userId,
    context,
    step,
    publish,
}) => {
    await publish(
        postgresqlChannel().status({
            nodeId,
            status: 'loading',
        }),
    );

    if (!data.variableName) {
        await publish(
            postgresqlChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('PostgreSQL node: Variable name is missing');
    }

    if (!data.credentialId) {
        await publish(
            postgresqlChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('PostgreSQL node: Credential is required');
    }

    if (!data.query) {
        await publish(
            postgresqlChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('PostgreSQL node: Query is required');
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
            postgresqlChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Credential not found');
    }

    try {
        const connectionString = decrypt(credential.value);
        const client = new Client({
            connectionString,
        });

        await client.connect();

        // Compile query with Handlebars to support template variables
        const compiledQuery = Handlebars.compile(data.query)(context);

        const result = await client.query(compiledQuery);

        await client.end();

        await publish(
            postgresqlChannel().status({
                nodeId,
                status: 'success',
            }),
        );

        return {
            ...context,
            [data.variableName]: {
                rows: result.rows,
                rowCount: result.rowCount,
                command: result.command,
            },
        };
    } catch (error) {
        await publish(
            postgresqlChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw error;
    }
};

