import { sendWorkflowExecution } from "@/inngest/utils";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const url = new URL(request.url);
        const workflowId = url.searchParams.get('workflowId');

        if (!workflowId) {
            return NextResponse.json(
                { success: false, error: 'Missing required query parameter: workflowId'},
                { status: 400 },
            );
        };

        let body: any = {};
        try {
            const contentType = request.headers.get('content-type');
            if (contentType?.includes('application/json')) {
                body = await request.json();
            } else {
                body = await request.text();
            }
        } catch {
            // If body parsing fails, leave as empty object
            body = {};
        }
        const headers = Object.fromEntries(request.headers.entries());
        const query = Object.fromEntries(url.searchParams.entries());

        const webhookData = {
            body,
            headers,
            query,
            timestamp: new Date().toISOString(),
        };

        // Trigger an Inngest job
        await sendWorkflowExecution({
                    workflowId,
                    initialData: {
                        webhook: webhookData,
                    },
                });

        return NextResponse.json(
            { success: true },
            { status: 200 },
        );
    } catch (error) {
        console.log('Webhook error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to process webhook'},
            { status: 500 },
        );
    }
}

