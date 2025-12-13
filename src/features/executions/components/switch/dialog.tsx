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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { useEffect } from "react";

const caseSchema = z.object({
  condition: z.string().min(1, { message: "Condition is required" }),
  label: z.string().optional(),
});

const formSchema = z.object({
  variableName: z
    .string()
    .min(1, { message: "Variable name is required" })
    .regex(/^[a-zA-Z_$][A-Za-z0-9_$]*$/, {
      message:
        "Variable name must start with a letter or underscore and contain only letters, numbers and underscores.",
    }),
  cases: z.array(caseSchema).min(1, { message: "At least one case is required" }),
});

export type SwitchFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: SwitchFormValues) => void;
  defaultValues?: Partial<SwitchFormValues>;
}

export const SwitchDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  // Convert old format to new format for backward compatibility
  const getDefaultCases = () => {
    if (defaultValues.cases && Array.isArray(defaultValues.cases)) {
      return defaultValues.cases;
    }
    // Legacy: convert old single condition to cases array
    if (defaultValues.condition) {
      return [{ condition: defaultValues.condition, label: "" }];
    }
    return [{ condition: "{{variable.value}}", label: "" }];
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      variableName: defaultValues.variableName || "switch",
      cases: getDefaultCases(),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "cases",
  });

  useEffect(() => {
    if (open) {
      form.reset({
        variableName: defaultValues.variableName || "switch",
        cases: getDefaultCases(),
      });
    }
  }, [open, defaultValues, form]);

  const watchVariableName = form.watch("variableName") || "switch";

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="pb-2 flex-shrink-0">
          <DialogTitle className="text-base">Switch (Conditional)</DialogTitle>
          <DialogDescription className="text-xs">
            Evalúa múltiples condiciones y dirige el flujo al primer caso que sea verdadero. Si ningún caso coincide, se ejecuta el caso por defecto.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1">
          <Form {...form}>
            <form
              id="switch-form"
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
                      Referencia: {`{{${watchVariableName}.result}}`} (índice del caso que coincidió, o -1 si ninguno)
                    </FormDescription>
                  </FormItem>
                )}
              />
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-sm">Cases</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ condition: "", label: "" })}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Case
                  </Button>
                </div>
                
                {fields.map((field, index) => (
                  <div key={field.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-sm">Case {index}</FormLabel>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <FormField
                      control={form.control}
                      name={`cases.${index}.label`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Label (optional)</FormLabel>
                          <FormControl>
                            <Input placeholder={`Case ${index}`} {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`cases.${index}.condition`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Condition Expression</FormLabel>
                          <FormControl>
                            <Textarea
                              className="min-h-[80px] font-mono text-sm"
                              placeholder={`{{webhook.body.value}} > 10`}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Expresión JavaScript. Ejemplos: {"{{value}} > 10"}, {"{{status}} === 'active'"}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
              </div>
            </form>
          </Form>
        </div>
        <DialogFooter className="mt-4 pt-2 flex-shrink-0">
          <Button type="submit" form="switch-form" size="sm">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};






