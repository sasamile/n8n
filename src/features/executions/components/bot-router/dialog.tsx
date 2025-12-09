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
import { Checkbox } from "@/components/ui/checkbox";
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
  messageField: z.string().min(1, "Message field is required"),
  availableBots: z.array(z.string()).min(1, "At least one bot must be selected"),
});

export type BotRouterFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: BotRouterFormValues) => void;
  defaultValues?: Partial<BotRouterFormValues>;
}

const BOT_OPTIONS = [
  { value: "normal", label: "Bot Normal" },
  { value: "finanzas", label: "Bot Finanzas" },
  { value: "soporte", label: "Bot Soporte Técnico" },
  { value: "atencion", label: "Bot Atención al Cliente" },
];

export const BotRouterDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const { data: openaiCredentials, isLoading: isLoadingOpenAI } =
    useCredentialsByType(CredentialType.OPENAI);
  const { data: geminiCredentials, isLoading: isLoadingGemini } =
    useCredentialsByType(CredentialType.GEMINI);
  const { data: anthropicCredentials, isLoading: isLoadingAnthropic } =
    useCredentialsByType(CredentialType.ANTHROPIC);

  const allCredentials = [
    ...(openaiCredentials || []).map((c) => ({ ...c, provider: "OPENAI" })),
    ...(geminiCredentials || []).map((c) => ({ ...c, provider: "GEMINI" })),
    ...(anthropicCredentials || []).map((c) => ({ ...c, provider: "ANTHROPIC" })),
  ];

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName || "botRouter",
      credentialId: defaultValues.credentialId || "",
      messageField: defaultValues.messageField || "{{webhook.body.mensaje}}",
      availableBots: defaultValues.availableBots || ["normal"],
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        variableName: defaultValues.variableName || "botRouter",
        credentialId: defaultValues.credentialId || "",
        messageField: defaultValues.messageField || "{{webhook.body.mensaje}}",
        availableBots: defaultValues.availableBots || ["normal"],
      });
    }
  }, [open, defaultValues, form]);

  const watchVariableName = form.watch("variableName") || "botRouter";
  const watchAvailableBots = form.watch("availableBots") || [];

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    // Sort availableBots according to BOT_OPTIONS order to match visual handle order
    const sortedBots = values.availableBots.sort((a, b) => {
      const indexA = BOT_OPTIONS.findIndex(opt => opt.value === a);
      const indexB = BOT_OPTIONS.findIndex(opt => opt.value === b);
      return indexA - indexB;
    });
    
    onSubmit({
      ...values,
      availableBots: sortedBots,
    });
    onOpenChange(false);
  };

  const getCredentialIcon = (provider: string) => {
    switch (provider) {
      case "OPENAI":
        return "/logos/openai.svg";
      case "GEMINI":
        return "/logos/gemini.svg";
      case "ANTHROPIC":
        return "/logos/anthropic.svg";
      default:
        return "/logos/openai.svg";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base">Bot Router Configuration</DialogTitle>
          <DialogDescription className="text-xs">
            Configura el router de bots que detecta la intención y dirige el flujo al bot correcto.
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
                    Referencia: {`{{${watchVariableName}.intent}}`} y {`{{${watchVariableName}.bot}}`}
                  </FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="credentialId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">AI Credential</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={
                      isLoadingOpenAI || isLoadingGemini || isLoadingAnthropic || !allCredentials.length
                    }
                  >
                    <FormControl>
                      <SelectTrigger className="w-full h-9">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {allCredentials.map((credential) => (
                        <SelectItem key={credential.id} value={credential.id}>
                          <div className="flex items-center gap-2">
                            <Image
                              src={getCredentialIcon(credential.provider)}
                              alt={credential.provider}
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
              name="messageField"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm">Message Field</FormLabel>
                  <FormControl>
                    <Input
                      className="font-mono text-sm"
                      placeholder="{{webhook.body.mensaje}}"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs leading-tight">
                    Campo del mensaje a analizar para detectar la intención
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="availableBots"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-sm">Available Bots</FormLabel>
                    <FormDescription className="text-xs">
                      Selecciona los bots disponibles para routing
                    </FormDescription>
                  </div>
                  {BOT_OPTIONS.map((bot) => (
                    <FormField
                      key={bot.value}
                      control={form.control}
                      name="availableBots"
                      render={({ field }) => {
                        return (
                          <FormItem
                            key={bot.value}
                            className="flex flex-row items-start space-x-3 space-y-0"
                          >
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(bot.value)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...field.value, bot.value])
                                    : field.onChange(
                                        field.value?.filter(
                                          (value) => value !== bot.value
                                        )
                                      );
                                }}
                              />
                            </FormControl>
                            <FormLabel className="text-sm font-normal">
                              {bot.label}
                            </FormLabel>
                          </FormItem>
                        );
                      }}
                    />
                  ))}
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='rounded-lg bg-muted p-2 space-y-2'>
              <h4 className='font-medium text-xs'>Variables Disponibles:</h4>
              <div className='flex flex-wrap gap-1 text-xs text-muted-foreground'>
                <code className='bg-background px-1 py-0.5 rounded'>{"{{webhook.body.mensaje}}"}</code>
                <code className='bg-background px-1 py-0.5 rounded'>{"{{negocio.httpResponse.data.prompt}}"}</code>
              </div>
              <div className='mt-2 pt-2 border-t border-border'>
                <p className='text-xs font-medium mb-1'>Cómo configurar herramientas de cada bot:</p>
                <ol className='text-xs text-muted-foreground space-y-1 list-decimal list-inside'>
                  <li>Conecta múltiples herramientas a cada salida del Bot Router</li>
                  <li>Ejemplo Bot Finanzas: Conecta OpenAI → HTTP Request → PostgreSQL</li>
                  <li>Las herramientas se ejecutarán en secuencia cuando se seleccione ese bot</li>
                  <li>Cada bot puede tener su propio flujo de herramientas independiente</li>
                </ol>
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

