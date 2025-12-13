import Handlebars from 'handlebars';
import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import OpenAI from 'openai';
import { audioToTextChannel } from '@/inngest/channels/audio-to-text';
import prisma from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import ky from 'ky';
import ytdl from '@distube/ytdl-core';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

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

// Helper function to convert m4a to mp3 using FFmpeg
async function convertM4aToMp3(buffer: Buffer, nodeId: string): Promise<Buffer | null> {
    try {
        // Check if FFmpeg is available
        try {
            await execAsync('ffmpeg -version');
        } catch {
            console.log(`[AudioToText ${nodeId}] FFmpeg not found. Please install FFmpeg manually: brew install ffmpeg (macOS) or apt-get install ffmpeg (Linux)`);
            return null;
        }

        // Create temporary files
        const tempDir = tmpdir();
        const inputPath = join(tempDir, `audio-input-${Date.now()}-${Math.random().toString(36).substring(7)}.m4a`);
        const outputPath = join(tempDir, `audio-output-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`);

        try {
            // Write input file
            writeFileSync(inputPath, buffer);

            // Convert using FFmpeg
            console.log(`[AudioToText ${nodeId}] Attempting to convert m4a to mp3 using FFmpeg...`);
            await execAsync(`ffmpeg -i "${inputPath}" -acodec libmp3lame -q:a 2 "${outputPath}" -y`);

            // Read converted file
            const convertedBuffer = readFileSync(outputPath);
            console.log(`[AudioToText ${nodeId}] Successfully converted m4a to mp3 (${(convertedBuffer.length / 1024 / 1024).toFixed(2)}MB)`);

            return convertedBuffer;
        } finally {
            // Clean up temporary files
            try {
                unlinkSync(inputPath);
            } catch (e) {
                console.warn(`[AudioToText ${nodeId}] Failed to delete temp input file:`, e);
            }
            try {
                unlinkSync(outputPath);
            } catch (e) {
                console.warn(`[AudioToText ${nodeId}] Failed to delete temp output file:`, e);
            }
        }
    } catch (error) {
        console.error(`[AudioToText ${nodeId}] Failed to convert m4a to mp3:`, error);
        return null;
    }
}

// Helper function to detect audio file format from magic bytes
function detectAudioFormat(buffer: Buffer | Uint8Array | ArrayBuffer): { extension: string; mimeType: string } {
    let bytes: Buffer;
    if (Buffer.isBuffer(buffer)) {
        bytes = buffer;
    } else if (buffer instanceof Uint8Array) {
        bytes = Buffer.from(buffer);
    } else {
        bytes = Buffer.from(buffer);
    }
    const firstBytes = bytes.slice(0, 12);
    
    // MP3: ID3 tag (ID3) or MPEG frame sync (0xFF 0xFB/0xFA/0xF2/0xF3)
    if (firstBytes.slice(0, 3).toString() === 'ID3') {
        return { extension: 'mp3', mimeType: 'audio/mpeg' };
    }
    if (firstBytes[0] === 0xFF && (firstBytes[1] & 0xE0) === 0xE0) {
        return { extension: 'mp3', mimeType: 'audio/mpeg' };
    }
    
    // WAV: RIFF...WAVE
    if (firstBytes.slice(0, 4).toString() === 'RIFF' && firstBytes.slice(8, 12).toString() === 'WAVE') {
        return { extension: 'wav', mimeType: 'audio/wav' };
    }
    
    // FLAC: fLaC
    if (firstBytes.slice(0, 4).toString() === 'fLaC') {
        return { extension: 'flac', mimeType: 'audio/flac' };
    }
    
    // OGG: OggS
    if (firstBytes.slice(0, 4).toString() === 'OggS') {
        return { extension: 'ogg', mimeType: 'audio/ogg' };
    }
    
    // WebM: starts with 0x1A 0x45 0xDF 0xA3
    if (firstBytes[0] === 0x1A && firstBytes[1] === 0x45 && firstBytes[2] === 0xDF && firstBytes[3] === 0xA3) {
        return { extension: 'webm', mimeType: 'audio/webm' };
    }
    
    // M4A/MP4: ftyp box (ftyp at offset 4)
    // Note: OpenAI Whisper requires audio/mp4 MIME type for both m4a and mp4 files
    if (firstBytes.slice(4, 8).toString() === 'ftyp') {
        // Check brand to distinguish between m4a and mp4
        const brand = firstBytes.slice(8, 12).toString();
        // Log the brand for debugging
        console.log(`[AudioToText] Detected MP4 container, brand: ${brand}`);
        
        // Some m4a files might not work with OpenAI Whisper even with correct MIME type
        // If brand indicates m4a, we'll still use audio/mp4 but log a warning
        if (brand.includes('M4A') || brand.includes('mp41') || brand.includes('mp42') || brand.includes('isom')) {
            // Use audio/mp4 for m4a files as OpenAI Whisper requires this MIME type
            // Note: Some m4a files may still fail - user may need to convert to mp3
            return { extension: 'm4a', mimeType: 'audio/mp4' };
        }
        return { extension: 'mp4', mimeType: 'audio/mp4' };
    }
    
    // Default to mp3 if format cannot be detected
    console.warn(`[AudioToText] Could not detect audio format from magic bytes, defaulting to mp3`);
    return { extension: 'mp3', mimeType: 'audio/mpeg' };
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
                if (!data.audioUrl) {
                    throw new NonRetriableError('Audio to Text node: Audio URL is required');
                }
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
            // Convert audioBuffer to Buffer if needed (Inngest may serialize it)
            let bufferForDetection: Buffer;
            if (Buffer.isBuffer(audioBuffer)) {
                bufferForDetection = audioBuffer;
            } else if (audioBuffer instanceof Uint8Array) {
                bufferForDetection = Buffer.from(audioBuffer);
            } else {
                bufferForDetection = Buffer.from(audioBuffer as unknown as ArrayBuffer);
            }
            
            // First, try to detect format from magic bytes (most reliable)
            const detectedFormat = detectAudioFormat(bufferForDetection);
            
            // Also check URL extension as fallback/validation
            let urlExtension: string | undefined;
            try {
                const urlPath = new URL(audioUrl).pathname;
                urlExtension = urlPath.split('.').pop()?.toLowerCase();
            } catch {
                // URL parsing failed, ignore
            }
            
            // Use detected format, but log if URL extension differs
            const extension = detectedFormat.extension;
            const mimeType = detectedFormat.mimeType;
            
            if (urlExtension && urlExtension !== extension) {
                console.log(`[AudioToText ${nodeId}] Format mismatch: URL extension is "${urlExtension}" but detected format is "${extension}" (using detected format)`);
            }
            
            console.log(`[AudioToText ${nodeId}] Detected audio format: ${extension} (${mimeType})`);
            
            // Ensure filename has correct extension - OpenAI Whisper may check the extension
            const filename = `audio.${extension}`;
            
            // Log buffer info for debugging
            let bufferSize: number;
            if (Buffer.isBuffer(audioBuffer)) {
                bufferSize = audioBuffer.length;
            } else if (audioBuffer instanceof Uint8Array) {
                bufferSize = audioBuffer.length;
            } else if (audioBuffer && typeof audioBuffer === 'object' && 'byteLength' in audioBuffer) {
                bufferSize = (audioBuffer as unknown as ArrayBuffer).byteLength;
            } else {
                // Fallback: use bufferForDetection size
                bufferSize = bufferForDetection.length;
            }
            const sizeMB = isNaN(bufferSize) ? 'unknown' : (bufferSize / 1024 / 1024).toFixed(2);
            console.log(`[AudioToText ${nodeId}] Audio buffer size: ${sizeMB}MB`);
            
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
                let bufferForFile: Uint8Array;
                if (Buffer.isBuffer(audioFile.buffer)) {
                    bufferForFile = new Uint8Array(audioFile.buffer);
                } else if (audioFile.buffer instanceof Uint8Array) {
                    bufferForFile = audioFile.buffer;
                } else {
                    bufferForFile = new Uint8Array(audioFile.buffer as unknown as ArrayBuffer);
                }
                
                const bufferSize = bufferForFile.length;
                console.log(`[AudioToText ${nodeId}] Uploading audio file: ${audioFile.filename}, size: ${(bufferSize / 1024 / 1024).toFixed(2)}MB, type: ${audioFile.mimeType}`);
                
                // OpenAI SDK in Node.js requires a File-like object
                // Create a File object - in Node.js 18+, File is available globally
                let fileToUpload: any;
                
                // Check if File constructor is available
                if (typeof File !== 'undefined') {
                    fileToUpload = new File([bufferForFile as BlobPart], audioFile.filename, { 
                        type: audioFile.mimeType 
                    });
                } else {
                    // Fallback: Create a File-like object using Blob
                    // OpenAI SDK should accept Blob in Node.js
                    const blob = new Blob([bufferForFile as BlobPart], { type: audioFile.mimeType });
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
                console.error(`[AudioToText ${nodeId}] File details: filename=${audioFile.filename}, mimeType=${audioFile.mimeType}, size=${audioFile.buffer instanceof Buffer ? audioFile.buffer.length : 'unknown'}`);
                
                if (error instanceof Error) {
                    // Check for specific OpenAI errors
                    if (error.message.includes('file_size_exceeded') || error.message.includes('too large')) {
                        throw new NonRetriableError('Audio to Text node: Audio file is too large. Maximum size is 25MB.');
                    }
                    if (error.message.includes('invalid_file_format') || error.message.includes('unsupported') || error.message.includes('400') || (error.message.includes('400') && error.message.includes('Invalid'))) {
                        const detectedFormat = audioFile.filename.split('.').pop() || 'unknown';
                        
                        // Special handling for m4a files: try to convert to mp3 automatically
                        if (detectedFormat === 'm4a') {
                            console.log(`[AudioToText ${nodeId}] m4a file rejected by Whisper, attempting automatic conversion to mp3...`);
                            
                            // Get original buffer
                            let originalBuffer: Buffer;
                            if (Buffer.isBuffer(audioFile.buffer)) {
                                originalBuffer = audioFile.buffer;
                            } else if (audioFile.buffer instanceof Uint8Array) {
                                originalBuffer = Buffer.from(audioFile.buffer);
                            } else {
                                originalBuffer = Buffer.from(audioFile.buffer as unknown as ArrayBuffer);
                            }
                            
                            // Try to convert
                            const convertedBuffer = await convertM4aToMp3(originalBuffer, nodeId);
                            
                            if (convertedBuffer) {
                                console.log(`[AudioToText ${nodeId}] Retrying transcription with converted mp3 file...`);
                                
                                // Create new file with converted buffer
                                let bufferForFile: Uint8Array = new Uint8Array(convertedBuffer);
                                const convertedFilename = audioFile.filename.replace(/\.m4a$/i, '.mp3');
                                
                                let fileToUpload: any;
                                if (typeof File !== 'undefined') {
                                    fileToUpload = new File([bufferForFile as BlobPart], convertedFilename, { 
                                        type: 'audio/mpeg' 
                                    });
                                } else {
                                    const blob = new Blob([bufferForFile as BlobPart], { type: 'audio/mpeg' });
                                    Object.defineProperty(blob, 'name', { value: convertedFilename });
                                    fileToUpload = blob;
                                }
                                
                                // Retry transcription with converted file
                                try {
                                    const transcriptionResponse = await openai.audio.transcriptions.create({
                                        file: fileToUpload,
                                        model: 'whisper-1',
                                    }, {
                                        timeout: 300000,
                                    });
                                    
                                    console.log(`[AudioToText ${nodeId}] Transcription completed successfully after conversion`);
                                    return transcriptionResponse;
                                } catch (retryError) {
                                    console.error(`[AudioToText ${nodeId}] Transcription failed even after conversion:`, retryError);
                                    // Fall through to error message
                                }
                            }
                            
                            // If conversion failed or retry failed, show error message
                            let errorMessage = `Audio to Text node: Invalid audio file format. Detected format: ${detectedFormat} (MIME type: ${audioFile.mimeType}).`;
                            errorMessage += '\n\nSome m4a files may not be compatible with OpenAI Whisper even though m4a is listed as a supported format. This typically happens when the m4a file uses a codec (like ALAC) that Whisper doesn\'t support.';
                            
                            if (!convertedBuffer) {
                                errorMessage += '\n\nAutomatic conversion to mp3 was attempted but failed (FFmpeg may not be installed or available).';
                            } else {
                                errorMessage += '\n\nAutomatic conversion to mp3 was successful, but the converted file was still rejected by Whisper.';
                            }
                            
                            errorMessage += '\n\nSolution: Convert the audio file to mp3 or wav format before using it. You can use tools like FFmpeg or online converters.';
                            
                            throw new NonRetriableError(errorMessage);
                        } else {
                            let errorMessage = `Audio to Text node: Invalid audio file format. Detected format: ${detectedFormat} (MIME type: ${audioFile.mimeType}).`;
                            errorMessage += `\n\nSupported formats: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm.\n\nIf your file is in a supported format but still fails, try converting it to mp3 or wav format.`;
                            throw new NonRetriableError(errorMessage);
                        }
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
        // Si el error ya es un NonRetriableError, relanzarlo sin modificar
        if (error instanceof NonRetriableError) {
            throw error;
        }
        // Si el mensaje ya comienza con "Audio to Text node: ", no duplicar
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.startsWith('Audio to Text node: ')) {
            throw new NonRetriableError(errorMessage);
        }
        throw new NonRetriableError(
            `Audio to Text node: ${errorMessage}`
        );
    }
};






