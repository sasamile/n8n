'use client';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CopyIcon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';


interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export const WebhookTriggerDialog = ({open, onOpenChange }: Props) => {
    const params = useParams();
    const workflowId = params.workflowId as string;

    //Construct the webhook URL
    const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const webhookURL = `${baseURL}/api/webhooks/webhook?workflowId=${workflowId}`;

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(webhookURL);
            toast.success('Webhook URL copied to clipboard');
        } catch {
            toast.error('Failed to copy URL');
        }
    }


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Webhook Trigger Configuration</DialogTitle>
                    <DialogDescription>
                        Use this webhook URL to trigger this workflow from any external service.
                    </DialogDescription>
                </DialogHeader>
                <div className='space-y-4'>
                    <div className='space-y-2'>
                        <Label htmlFor='webhook-url'>Webhook URL</Label>
                        <div className='flex gap-2'>
                            <Input
                              id='webhook-url'
                              value={webhookURL}
                              readOnly
                              className='font-mono text-sm'
                            />
                            <Button
                              type='button'
                              onClick={copyToClipboard}
                              variant={'outline'}
                              size={'icon'}
                            >
                                <CopyIcon className='size-4' />
                            </Button>
                        </div>
                    </div>

                    <div className='rounded-lg bg-muted p-4 space-y-2'>
                        <h4 className='font-medium text-sm'>Setup instructions:</h4>
                        <ol className='text-sm text-muted-foreground space-y-1 list-decimal list-inside'>
                            <li>Copy the webhook URL above</li>
                            <li>Configure it in your external service</li>
                            <li>Send POST requests to this URL to trigger the workflow</li>
                            <li>The request body will be available as {"{{webhook.body}}"} in your workflow</li>
                        </ol>
                    </div>

                    <div className='rounded-lg bg-muted p-4 space-y-2'>
                        <h4 className='font-medium text-sm'>Available Variables</h4>
                        <ul className='text-sm text-muted-foreground space-y-1'>
                            <li>
                                <code className='bg-background px-1 py-0.4 rounded'>
                                    {"{{webhook.body}}"}
                                </code>
                                - Request body
                            </li>
                            <li>
                                <code className='bg-background px-1 py-0.4 rounded'>
                                    {"{{webhook.headers}}"}
                                </code>
                                - Request headers
                            </li>
                            <li>
                                <code className='bg-background px-1 py-0.4 rounded'>
                                    {"{{webhook.query}}"}
                                </code>
                                - Query parameters
                            </li>
                            <li>
                                <code className='bg-background px-1 py-0.4 rounded'>
                                    {"{{json webhook}}"}
                                </code>
                                - Full webhook data as JSON
                            </li>
                        </ul>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

