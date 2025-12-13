import Handlebars from 'handlebars';
import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import OpenAI from 'openai';
import { audioToTextChannel } from '@/inngest/channels/audio-to-text';
import prisma from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import ky from 'ky';
import ytdl from '@distube/ytdl-core';

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

type AudioToTextData = {
    variableName?: string;
    credentialId?: string;
    audioUrl?: string;
};

export const audioToTextExecutor: NodeExecutor<AudioToTextData> = async ({
    data,
    nodeId,
    userId,
    context,
    step,
    publish,
}) => {
    await publish(
        audioToTextChannel().status({
            nodeId,
            status: 'loading',
        }),
    );

    if (!data.variableName) {
        await publish(
            audioToTextChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Audio to Text node: Variable name is missing');
    }

    if (!data.credentialId) {
        await publish(
            audioToTextChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Audio to Text node: Credential is required');
    }

    if (!data.audioUrl) {
        await publish(
            audioToTextChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError('Audio to Text node: Audio URL is required');
    }

    try {
        // Step 1: Compile and validate URL
        const audioUrl = await step.run('compile-url', async () => {
            try {
                const cleanedUrl = cleanHandlebarsTemplate(data.audioUrl);
                const template = Handlebars.compile(cleanedUrl);
                let url = template(context);
                
                if (!url || typeof url !== 'string') {
                    throw new NonRetriableError('Audio to Text node: Invalid audio URL after template compilation');
                }
                
                // Decode URL if it's encoded (handle special characters)
                try {
                    url = decodeURIComponent(url);
                } catch {
                    // If decoding fails, use original URL
                }
                
                console.log(`[AudioToText ${nodeId}] Audio URL compiled: ${url.substring(0, 100)}...`);
                
                return url;
            } catch (error) {
                throw new NonRetriableError(`Audio to Text node: Failed to compile audio URL template: ${error instanceof Error ? error.message : String(error)}`);
            }
        });

        // Step 2: Get credential
        const credential = await step.run('get-credential', async () => {
            const cred = await prisma.credential.findUnique({
                where: {
                    id: data.credentialId,
                    userId,
                },
            });

            if (!cred) {
                throw new NonRetriableError('Credential not found');
            }

            return cred;
        });

        const openai = new OpenAI({
            apiKey: decrypt(credential.value),
        });

        // Step 3: Download audio file
        const audioBuffer = await step.run('download-audio', async () => {
            console.log(`[AudioToText ${nodeId}] Starting audio download from: ${audioUrl.substring(0, 100)}...`);
            
            // Check if URL is a YouTube URL
            const isYouTube = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/.test(audioUrl);
            
            if (isYouTube) {
                console.log(`[AudioToText ${nodeId}] Detected YouTube URL, extracting audio...`);
                // Extract YouTube video ID
                const videoIdMatch = audioUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
                if (!videoIdMatch || !videoIdMatch[1]) {
                    throw new NonRetriableError('Audio to Text node: Could not extract YouTube video ID');
                }
                
                const videoId = videoIdMatch[1];
                const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                
                // Validate YouTube URL
                if (!ytdl.validateURL(videoUrl)) {
                    throw new NonRetriableError('Audio to Text node: Invalid YouTube URL');
                }
                
                // Get audio stream from YouTube
                const audioStream = ytdl(videoUrl, {
                    quality: 'highestaudio',
                    filter: 'audioonly',
                });
                
                // Convert stream to buffer with timeout
                const chunks: Buffer[] = [];
                const maxSize = 25 * 1024 * 1024; // 25MB limit for OpenAI
                let totalSize = 0;
                
                try {
                    for await (const chunk of audioStream) {
                        const bufferChunk = Buffer.from(chunk);
                        totalSize += bufferChunk.length;
                        
                        if (totalSize > maxSize) {
                            throw new NonRetriableError(`Audio to Text node: Audio file too large (${Math.round(totalSize / 1024 / 1024)}MB). Maximum size is 25MB.`);
                        }
                        
                        chunks.push(bufferChunk);
                    }
                } catch (error) {
                    if (error instanceof NonRetriableError) {
                        throw error;
                    }
                    throw new NonRetriableError(`Audio to Text node: Failed to download YouTube audio: ${error instanceof Error ? error.message : String(error)}`);
                }
                
                console.log(`[AudioToText ${nodeId}] YouTube audio downloaded, size: ${(Buffer.concat(chunks).length / 1024 / 1024).toFixed(2)}MB`);
                return Buffer.concat(chunks);
            } else {
                // Regular audio URL - use streaming download for large files
                console.log(`[AudioToText ${nodeId}] Downloading audio from URL...`);
                try {
                    // Use fetch with streaming for better handling of large files
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes timeout
                    
                    try {
                        const response = await fetch(audioUrl, {
                            signal: controller.signal,
                            headers: {
                                'Accept': 'audio/*',
                            },
                        });
                        
                        if (!response.ok) {
                            throw new NonRetriableError(`Audio to Text node: Failed to download audio file. HTTP ${response.status}: ${response.statusText}`);
                        }
                        
                        // Get content length for size check
                        const contentLength = response.headers.get('content-length');
                        if (contentLength) {
                            const sizeMB = parseInt(contentLength, 10) / 1024 / 1024;
                            console.log(`[AudioToText ${nodeId}] Audio file size from headers: ${sizeMB.toFixed(2)}MB`);
                            
                            if (sizeMB > 25) {
                                throw new NonRetriableError(`Audio to Text node: Audio file too large (${sizeMB.toFixed(2)}MB). Maximum size is 25MB.`);
                            }
                        }
                        
                        // Stream the response to buffer
                        const chunks: Uint8Array[] = [];
                        const reader = response.body?.getReader();
                        
                        if (!reader) {
                            throw new NonRetriableError('Audio to Text node: Could not get response stream');
                        }
                        
                        let totalSize = 0;
                        const maxSize = 25 * 1024 * 1024; // 25MB limit
                        
                        while (true) {
                            const { done, value } = await reader.read();
                            
                            if (done) break;
                            
                            if (value) {
                                totalSize += value.length;
                                
                                if (totalSize > maxSize) {
                                    throw new NonRetriableError(`Audio to Text node: Audio file too large (${(totalSize / 1024 / 1024).toFixed(2)}MB). Maximum size is 25MB.`);
                                }
                                
                                chunks.push(value);
                            }
                        }
                        
                        clearTimeout(timeoutId);
                        
                        // Combine chunks into single buffer
                        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                        const combined = new Uint8Array(totalLength);
                        let offset = 0;
                        for (const chunk of chunks) {
                            combined.set(chunk, offset);
                            offset += chunk.length;
                        }
                        
                        const sizeMB = totalSize / 1024 / 1024;
                        console.log(`[AudioToText ${nodeId}] Audio downloaded successfully, size: ${sizeMB.toFixed(2)}MB`);
                        
                        return Buffer.from(combined);
                    } finally {
                        clearTimeout(timeoutId);
                    }
                } catch (error) {
                    console.error(`[AudioToText ${nodeId}] Download error:`, error);
                    if (error instanceof NonRetriableError) {
                        throw error;
                    }
                    if (error instanceof Error && error.name === 'AbortError') {
                        throw new NonRetriableError('Audio to Text node: Download timeout. The file may be too large or the connection is too slow.');
                    }
                    throw new NonRetriableError(`Audio to Text node: Failed to download audio file: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        });

        // Step 4: Detect file type and prepare for OpenAI
        const audioFile = await step.run('prepare-audio', async () => {
            // Detect file extension from URL
            const urlPath = new URL(audioUrl).pathname;
            const extension = urlPath.split('.').pop()?.toLowerCase() || 'mp3';
            
            // Map extension to MIME type (OpenAI Whisper requires specific MIME types)
            const mimeTypes: Record<string, string> = {
                'mp3': 'audio/mpeg',
                'mp4': 'audio/mp4',
                'mpeg': 'audio/mpeg',
                'mpga': 'audio/mpeg',
                'm4a': 'audio/m4a', // OpenAI accepts m4a with this MIME type
                'wav': 'audio/wav',
                'webm': 'audio/webm',
                'flac': 'audio/flac',
                'oga': 'audio/ogg',
                'ogg': 'audio/ogg',
            };
            
            const mimeType = mimeTypes[extension] || 'audio/mpeg';
            const filename = `audio.${extension}`;
            
            // In Node.js, OpenAI SDK accepts Buffer directly
            // Create a File-like object that OpenAI SDK can handle
            return {
                buffer: audioBuffer,
                filename,
                mimeType,
            };
        });

        // Step 5: Call OpenAI Whisper API
        const response = await step.run('openai-whisper', async () => {
            try {
                // Ensure buffer is a Buffer or Uint8Array
                let bufferForFile: Buffer | Uint8Array;
                if (Buffer.isBuffer(audioFile.buffer)) {
                    bufferForFile = audioFile.buffer;
                } else if (audioFile.buffer instanceof Uint8Array) {
                    bufferForFile = Buffer.from(audioFile.buffer);
                } else {
                    bufferForFile = Buffer.from(audioFile.buffer as ArrayBuffer);
                }
                
                const bufferSize = bufferForFile.length;
                console.log(`[AudioToText ${nodeId}] Uploading audio file: ${audioFile.filename}, size: ${(bufferSize / 1024 / 1024).toFixed(2)}MB, type: ${audioFile.mimeType}`);
                
                // OpenAI SDK in Node.js requires a File-like object
                // Create a File object - in Node.js 18+, File is available globally
                let fileToUpload: any;
                
                // Check if File constructor is available
                if (typeof File !== 'undefined') {
                    fileToUpload = new File([bufferForFile], audioFile.filename, { 
                        type: audioFile.mimeType 
                    });
                } else {
                    // Fallback: Create a File-like object using Blob
                    // OpenAI SDK should accept Blob in Node.js
                    const blob = new Blob([bufferForFile], { type: audioFile.mimeType });
                    // Add name property to make it File-like
                    Object.defineProperty(blob, 'name', { value: audioFile.filename });
                    fileToUpload = blob;
                }
                
                const transcriptionResponse = await openai.audio.transcriptions.create({
                    file: fileToUpload,
                    model: 'whisper-1',
                }, {
                    timeout: 300000, // 5 minutes timeout for transcription
                });
                
                console.log(`[AudioToText ${nodeId}] Transcription completed successfully`);
                
                return transcriptionResponse;
            } catch (error) {
                console.error(`[AudioToText ${nodeId}] Error in transcription:`, error);
                
                if (error instanceof Error) {
                    // Check for specific OpenAI errors
                    if (error.message.includes('file_size_exceeded') || error.message.includes('too large')) {
                        throw new NonRetriableError('Audio to Text node: Audio file is too large. Maximum size is 25MB.');
                    }
                    if (error.message.includes('invalid_file_format') || error.message.includes('unsupported')) {
                        throw new NonRetriableError('Audio to Text node: Invalid audio file format. Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm');
                    }
                    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
                        throw new NonRetriableError('Audio to Text node: Request timeout. The audio file may be too large or the transcription is taking too long.');
                    }
                    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
                        throw new NonRetriableError('Audio to Text node: Network error. Could not connect to OpenAI API.');
                    }
                }
                throw error;
            }
        });

        const text = response.text || '';

        const result = {
            ...context,
            [data.variableName]: {
                text,
                audioUrl,
            },
        };

        await publish(
            audioToTextChannel().status({
                nodeId,
                status: 'success',
            }),
        );

        return result;
    } catch (error) {
        await publish(
            audioToTextChannel().status({
                nodeId,
                status: 'error',
            }),
        );
        throw new NonRetriableError(
            `Audio to Text node: ${error instanceof Error ? error.message : String(error)}`
        );
    }
};






