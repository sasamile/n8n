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
  audioUrl: z.string().min(1, { message: "Audio URL is required" }),
});

export type AudioToTextFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AudioToTextFormValues) => void;
  defaultValues?: Partial<AudioToTextFormValues>;
}

export const AudioToTextDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const { data: openaiCredentials, isLoading: isLoadingCredentials } =
    useCredentialsByType(CredentialType.OPENAI);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName || "audioText",
      credentialId: defaultValues.credentialId || "",
      audioUrl: defaultValues.audioUrl || "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        variableName: defaultValues.variableName || "audioText",
        credentialId: defaultValues.credentialId || "",
        audioUrl: defaultValues.audioUrl || "",
      });
    }
  }, [open, defaultValues, form]);

  const watchVariableName = form.watch("variableName") || "audioText";

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="pb-2 flex-shrink-0">
          <DialogTitle className="text-base">Audio to Text</DialogTitle>
          <DialogDescription className="text-xs">
            Convierte audio a texto usando OpenAI Whisper API. Soporta URLs de audio directas y videos de YouTube.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1">
          <Form {...form}>
            <form
              id="audio-to-text-form"
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
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                      }}
                      disabled={isLoadingCredentials || !openaiCredentials?.length}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full h-9">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {openaiCredentials?.map((credential) => (
                          <SelectItem key={credential.id} value={credential.id}>
                            <div className="flex items-center gap-2">
                              <Image
                                src="/logos/openai.svg"
                                alt="OpenAI"
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
                control={form.control}
                name="audioUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Audio URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/audio.mp3 o https://www.youtube.com/watch?v=..."
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      URL del archivo de audio, video de YouTube, o variable con URL. Usa {"{{variables}}"} para valores dinámicos.
                      Formatos soportados: mp3, mp4, mpeg, mpga, m4a, wav, webm, y URLs de YouTube
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>
        <DialogFooter className="mt-4 pt-2 flex-shrink-0">
          <Button type="submit" form="audio-to-text-form" size="sm">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};






