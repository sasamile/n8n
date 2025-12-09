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
import { useEffect } from "react";
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
  credentialId: z.string().min(1, "Credential is required"),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().min(1, "User prompt is required"),
});

export type OpenAiFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: z.infer<typeof formSchema>) => void;
  defaultValues?: Partial<OpenAiFormValues>;
  connectedToolsCount?: number;
}

export const OpenAiDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
  connectedToolsCount = 0,
}: Props) => {
  const { data: credentials, isLoading: isLoadingCredentials } =
    useCredentialsByType(CredentialType.OPENAI);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName || "",
      credentialId: defaultValues.credentialId || "",
      systemPrompt: defaultValues.systemPrompt || "",
      userPrompt: defaultValues.userPrompt || "",
    },
  });

  // Reset form values when dialog opens with new defaults
  useEffect(() => {
    if (open) {
      form.reset({
        variableName: defaultValues.variableName || "",
        credentialId: defaultValues.credentialId || "",
        systemPrompt: defaultValues.systemPrompt || "",
        userPrompt: defaultValues.userPrompt || "",
      });
    }
  }, [open, defaultValues, form]);

  const watchVariableName = form.watch("variableName") || "myOpenAi";

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    console.log("Form values: ", values);
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base">OpenAI Configuration</DialogTitle>
          <DialogDescription className="text-xs">
            Configure the AI model and prompts for this node.
            {connectedToolsCount > 0 && (
              <span className="block mt-1 text-muted-foreground">
                {connectedToolsCount} herramienta{connectedToolsCount > 1 ? 's' : ''} conectada{connectedToolsCount > 1 ? 's' : ''}. El modelo decidirá cuál usar según el contexto.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
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
              name="credentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">OpenAI Credential</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
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
                              src={"/logos/openai.svg"}
                              alt={"OpenAI"}
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
                  Este nodo tiene {connectedToolsCount} herramienta{connectedToolsCount > 1 ? 's' : ''} conectada{connectedToolsCount > 1 ? 's' : ''}. 
                  El modelo de IA decidirá automáticamente cuándo y cuál herramienta usar basándose en el contexto del usuario.
                </p>
              </div>
            )}
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
            <DialogFooter className="mt-1 pt-2">
              <Button type="submit" size="sm">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
