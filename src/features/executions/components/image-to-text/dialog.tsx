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
  imageUrl: z.string().min(1, { message: "Image URL is required" }),
  prompt: z.string().optional(),
});

export type ImageToTextFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ImageToTextFormValues) => void;
  defaultValues?: Partial<ImageToTextFormValues>;
}

export const ImageToTextDialog = ({
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
      variableName: defaultValues.variableName || "imageText",
      credentialId: defaultValues.credentialId || "",
      imageUrl: defaultValues.imageUrl || "",
      prompt: defaultValues.prompt || "What's in this image?",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        variableName: defaultValues.variableName || "imageText",
        credentialId: defaultValues.credentialId || "",
        imageUrl: defaultValues.imageUrl || "",
        prompt: defaultValues.prompt || "What's in this image?",
      });
    }
  }, [open, defaultValues, form]);

  const watchVariableName = form.watch("variableName") || "imageText";

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="pb-2 flex-shrink-0">
          <DialogTitle className="text-base">Image to Text (AI)</DialogTitle>
          <DialogDescription className="text-xs">
            Convierte imágenes a texto usando OpenAI Vision API.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1">
          <Form {...form}>
            <form
              id="image-to-text-form"
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
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Image URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/image.jpg o {{webhook.body.imageUrl}}"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      URL de la imagen o variable con URL. Usa {"{{variables}}"} para valores dinámicos.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="prompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Prompt (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        className="min-h-[80px] font-mono text-sm"
                        placeholder="What's in this image? Describe it in detail."
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Instrucciones para la IA sobre qué extraer de la imagen.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>
        <DialogFooter className="mt-4 pt-2 flex-shrink-0">
          <Button type="submit" form="image-to-text-form" size="sm">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};






