"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormDescription,
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
  FormField,
} from "@/components/ui/form";
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect, useRef } from "react";
import { useCredentialsByType } from "@/features/credentials/hooks/use-credentials";
import { CredentialType } from "@/generated/prisma";
import Image from "next/image";

const formSchema = z.object({
  variableName: z
    .string()
    .min(1, { message: "Variable name is required" })
    .regex(/^[a-zA-Z_$][A-Za-z0-9_$]*$/, {
      message:
        "Variable name must start with a letter or underscore and contain only letters, numbers and underscores.",
    }),
  modelType: z.enum(["OPENAI", "ANTHROPIC", "GEMINI"]),
  credentialId: z.string().min(1, "Credential is required"),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().min(1, "User prompt is required"),
});

export type AiAgentFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: z.infer<typeof formSchema>) => void;
  defaultValues?: Partial<AiAgentFormValues>;
  connectedToolsCount?: number;
}

export const AiAgentDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
  connectedToolsCount = 0,
}: Props) => {
  const { data: openaiCredentials, isLoading: isLoadingOpenAI } =
    useCredentialsByType(CredentialType.OPENAI);
  const { data: anthropicCredentials, isLoading: isLoadingAnthropic } =
    useCredentialsByType(CredentialType.ANTHROPIC);
  const { data: geminiCredentials, isLoading: isLoadingGemini } =
    useCredentialsByType(CredentialType.GEMINI);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName || "",
      modelType: defaultValues.modelType || "OPENAI",
      credentialId: defaultValues.credentialId || "",
      systemPrompt: defaultValues.systemPrompt || "",
      userPrompt: defaultValues.userPrompt || "",
    },
  });

  const watchedModelType = form.watch("modelType") || "OPENAI";

  const getCredentials = () => {
    switch (watchedModelType) {
      case "OPENAI":
        return openaiCredentials || [];
      case "ANTHROPIC":
        return anthropicCredentials || [];
      case "GEMINI":
        return geminiCredentials || [];
      default:
        return [];
    }
  };

  const credentials = getCredentials();
  const isLoadingCredentials =
    (watchedModelType === "OPENAI" && isLoadingOpenAI) ||
    (watchedModelType === "ANTHROPIC" && isLoadingAnthropic) ||
    (watchedModelType === "GEMINI" && isLoadingGemini);

  const previousModelType = useRef<string | null>(null);

  // Reset credentials only when the user cambia el modelo seleccionado
  useEffect(() => {
    if (previousModelType.current && previousModelType.current !== watchedModelType) {
      form.setValue("credentialId", "");
    }
    previousModelType.current = watchedModelType;
  }, [watchedModelType, form]);

  // Reset form values when dialog opens with new defaults
  useEffect(() => {
    if (open) {
      form.reset({
        variableName: defaultValues.variableName || "",
        modelType: defaultValues.modelType || "OPENAI",
        credentialId: defaultValues.credentialId || "",
        systemPrompt: defaultValues.systemPrompt || "",
        userPrompt: defaultValues.userPrompt || "",
      });
    }
  }, [open, defaultValues, form]);

  const watchVariableName = form.watch("variableName") || "aiAgent";

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    console.log("Form values: ", values);
    onSubmit(values);
    onOpenChange(false);
  };

  const getModelIcon = (type: string) => {
    switch (type) {
      case "OPENAI":
        return "/logos/openai.svg";
      case "ANTHROPIC":
        return "/logos/anthropic.svg";
      case "GEMINI":
        return "/logos/gemini.svg";
      default:
        return "/logos/openai.svg";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="pb-2 flex-shrink-0">
          <DialogTitle className="text-base">AI Agent Configuration</DialogTitle>
          <DialogDescription className="text-xs">
            Configure el agente de IA con selección de modelo y prompts. Conecta herramientas desde los handles especiales (amarillos) en el lado derecho del nodo.
            {connectedToolsCount > 0 && (
              <span className="block mt-1 text-muted-foreground">
                {connectedToolsCount} herramienta{connectedToolsCount > 1 ? 's' : ''} conectada{connectedToolsCount > 1 ? 's' : ''}. El agente decidirá cuál usar según el contexto.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1">
        <Form {...form}>
          <form
              id="ai-agent-form"
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-3 mt-1"
          >
            <FormField
              control={form.control}
              name="variableName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Variable Name</FormLabel>
                  <FormControl>
                    <Input placeholder={watchVariableName} {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Referencia: {`{{${watchVariableName}.text}}`}
                  </FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="modelType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">AI Model</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full h-9">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="OPENAI">
                        <div className="flex items-center gap-2">
                          <Image
                            src="/logos/openai.svg"
                            alt="OpenAI"
                            width={16}
                            height={16}
                          />
                          OpenAI
                        </div>
                      </SelectItem>
                      <SelectItem value="ANTHROPIC">
                        <div className="flex items-center gap-2">
                          <Image
                            src="/logos/anthropic.svg"
                            alt="Anthropic"
                            width={16}
                            height={16}
                          />
                          Anthropic
                        </div>
                      </SelectItem>
                      <SelectItem value="GEMINI">
                        <div className="flex items-center gap-2">
                          <Image
                            src="/logos/gemini.svg"
                            alt="Gemini"
                            width={16}
                            height={16}
                          />
                          Gemini
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="credentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">
                    {form.watch("modelType") === "OPENAI" && "OpenAI"}
                    {form.watch("modelType") === "ANTHROPIC" && "Anthropic"}
                    {form.watch("modelType") === "GEMINI" && "Gemini"} Credential
                  </FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                    }}
                    disabled={isLoadingCredentials || !credentials?.length}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full h-9">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {credentials?.map((credential) => (
                        <SelectItem key={credential.id} value={credential.id}>
                          <div className="flex items-center gap-2">
                            <Image
                              src={getModelIcon(form.watch("modelType") || "OPENAI")}
                              alt={form.watch("modelType") || "OpenAI"}
                              width={16}
                              height={16}
                            />
                            {credential.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="systemPrompt"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">System Prompt (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-[50px] font-mono text-sm"
                      placeholder={`{{negocio.httpResponse.data.prompt}}`}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs leading-tight">
                    Usa {"{{negocio.httpResponse.data.prompt}}"} para el contexto del negocio
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name="userPrompt"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">User Prompt</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-[60px] font-mono text-sm"
                      placeholder={
                        "{{webhook.body.mensaje}}"
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs leading-tight">
                    Usa {"{{webhook.body.mensaje}}"} para el mensaje recibido
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {connectedToolsCount > 0 && (
              <div className='rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-2 space-y-1'>
                <h4 className='font-medium text-xs text-blue-900 dark:text-blue-100'>Herramientas Configuradas:</h4>
                <p className='text-xs text-blue-700 dark:text-blue-300'>
                  Este agente tiene {connectedToolsCount} herramienta{connectedToolsCount > 1 ? 's' : ''} conectada{connectedToolsCount > 1 ? 's' : ''}. 
                  El modelo de IA decidirá automáticamente cuándo y cuál herramienta usar basándose en el contexto del usuario.
                </p>
              </div>
            )}
            <div className='rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-2 space-y-1'>
              <h4 className='font-medium text-xs text-amber-900 dark:text-amber-100'>Cómo conectar herramientas:</h4>
              <ol className='text-xs text-amber-700 dark:text-amber-300 space-y-1 list-decimal list-inside'>
                <li>Arrastra nodos de herramientas (HTTP Request, PostgreSQL, etc.) al lado derecho del nodo AI Agent</li>
                <li>Conecta desde los <strong>handles amarillos</strong> (tool-1, tool-2, etc.) del AI Agent hacia las herramientas</li>
                <li>El handle <strong>source-1</strong> (blanco) es para el flujo normal, NO para herramientas</li>
                <li>El agente decidirá automáticamente cuál herramienta usar según el contexto del usuario</li>
              </ol>
            </div>
            <div className='rounded-lg bg-muted p-1.5 space-y-1'>
              <h4 className='font-medium text-xs'>Variables:</h4>
              <div className='flex flex-row gap-2 text-xs'>
                <div className='flex-1'>
                  <div className='flex flex-wrap gap-1 text-muted-foreground'>
                    <code className='bg-background px-1 py-0.5 rounded text-xs'>{"{{webhook.body.mensaje}}"}</code>
                    <code className='bg-background px-1 py-0.5 rounded text-xs'>{"{{negocio.httpResponse.data.prompt}}"}</code>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </Form>
        </div>
        <DialogFooter className="mt-4 pt-2 flex-shrink-0">
          <Button type="submit" form="ai-agent-form" size="sm">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

