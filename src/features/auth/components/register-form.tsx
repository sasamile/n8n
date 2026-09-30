'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';

const registerSchema = z
    .object({
        email: z.email('Ingresa un email válido'),
        password: z.string().min(1, 'La contraseña es obligatoria'),
        confirmPassword: z.string(),
        marketing: z.boolean().optional(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: 'Las contraseñas no coinciden',
        path: ['confirmPassword'],
    });

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
    const router = useRouter();
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const form = useForm<RegisterFormValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            email: '',
            password: '',
            confirmPassword: '',
            marketing: false,
        },
    });

    const signInGithub = async () => {
        await authClient.signIn.social(
            { provider: 'github' },
            {
                onSuccess: () => router.push('/'),
                onError: () => toast.error('Algo salió mal'),
            },
        );
    };

    const signInGoogle = async () => {
        await authClient.signIn.social(
            { provider: 'google' },
            {
                onSuccess: () => router.push('/'),
                onError: () => toast.error('Algo salió mal'),
            },
        );
    };

    const onSubmit = async (values: RegisterFormValues) => {
        await authClient.signUp.email(
            {
                name: values.email,
                email: values.email,
                password: values.password,
                callbackURL: '/',
            },
            {
                onSuccess: () => router.push('/'),
                onError: (ctx) => toast.error(ctx.error.message),
            },
        );
    };

    const isPending = form.formState.isSubmitting;

    return (
        <div className="w-full">
            <div className="mb-6 space-y-1.5">
                <h2 className="text-[1.7rem] font-semibold tracking-tight text-slate-900">
                    Crear una cuenta
                </h2>
                <p className="text-[13px] text-slate-500">
                    Estás a pocos pasos de comenzar.
                </p>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                        control={form.control}
                        name="marketing"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center gap-2.5 space-y-0">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        className="size-4 rounded-[4px] border-slate-300 data-[state=checked]:border-[#007BFF] data-[state=checked]:bg-[#007BFF]"
                                    />
                                </FormControl>
                                <FormLabel className="text-[12.5px] font-normal text-slate-500">
                                    Recibir novedades, actualizaciones y consejos.
                                </FormLabel>
                            </FormItem>
                        )}
                    />

                    <div className="space-y-3.5">
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem className="gap-1.5">
                                    <FormLabel className="text-[13px] font-medium text-slate-800">
                                        Email
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="email"
                                            placeholder="Ingresa tu email"
                                            className="h-12 rounded-[10px] border-slate-200 bg-white px-4 text-[14px] shadow-none transition-[border-color,box-shadow] duration-200 placeholder:text-slate-400 hover:border-slate-300 focus-visible:border-[#007BFF] focus-visible:ring-[#007BFF]/20"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem className="gap-1.5">
                                    <FormLabel className="text-[13px] font-medium text-slate-800">
                                        Contraseña
                                    </FormLabel>
                                    <FormControl>
                                        <div className="relative">
                                            <Input
                                                type={showPassword ? 'text' : 'password'}
                                                placeholder="**********"
                                                className="h-12 rounded-[10px] border-slate-200 bg-white px-4 pr-11 text-[14px] shadow-none transition-[border-color,box-shadow] duration-200 placeholder:text-slate-400 hover:border-slate-300 focus-visible:border-[#007BFF] focus-visible:ring-[#007BFF]/20"
                                                {...field}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword((v) => !v)}
                                                className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                                                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="size-4" />
                                                ) : (
                                                    <Eye className="size-4" />
                                                )}
                                            </button>
                                        </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="confirmPassword"
                            render={({ field }) => (
                                <FormItem className="gap-1.5">
                                    <FormLabel className="text-[13px] font-medium text-slate-800">
                                        Confirmar contraseña
                                    </FormLabel>
                                    <FormControl>
                                        <div className="relative">
                                            <Input
                                                type={showConfirm ? 'text' : 'password'}
                                                placeholder="**********"
                                                className="h-12 rounded-[10px] border-slate-200 bg-white px-4 pr-11 text-[14px] shadow-none transition-[border-color,box-shadow] duration-200 placeholder:text-slate-400 hover:border-slate-300 focus-visible:border-[#007BFF] focus-visible:ring-[#007BFF]/20"
                                                {...field}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirm((v) => !v)}
                                                className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                                                aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                            >
                                                {showConfirm ? (
                                                    <EyeOff className="size-4" />
                                                ) : (
                                                    <Eye className="size-4" />
                                                )}
                                            </button>
                                        </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <p className="text-[11px] leading-relaxed text-slate-400">
                        Al registrarte aceptas nuestra{' '}
                        <span className="font-medium text-slate-700">Política de privacidad</span>{' '}
                        y nuestros{' '}
                        <span className="font-medium text-slate-700">Términos de servicio</span>.
                    </p>

                    <Button
                        type="submit"
                        className="h-12 w-full rounded-[10px] bg-[#007BFF] text-[14px] font-semibold shadow-none transition-all duration-200 hover:bg-[#0066d6] active:scale-[0.99]"
                        disabled={isPending}
                    >
                        {isPending ? 'Creando…' : 'Crear cuenta'}
                    </Button>

                    <div className="relative py-1">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-slate-200" />
                        </div>
                        <div className="relative flex justify-center text-[12px] text-slate-400">
                            <span className="bg-white px-3">o</span>
                        </div>
                    </div>

                    <div className="grid gap-3">
                        <Button
                            variant="outline"
                            className="h-12 w-full rounded-[10px] border-slate-200 bg-white text-[14px] font-medium shadow-none transition-colors duration-200 hover:border-slate-300 hover:bg-slate-50"
                            type="button"
                            disabled={isPending}
                            onClick={signInGoogle}
                        >
                            <Image src="/logos/google.svg" width={18} height={18} alt="" />
                            Continuar con Google
                        </Button>
                        <Button
                            variant="outline"
                            className="h-12 w-full rounded-[10px] border-slate-200 bg-white text-[14px] font-medium shadow-none transition-colors duration-200 hover:border-slate-300 hover:bg-slate-50"
                            type="button"
                            disabled={isPending}
                            onClick={signInGithub}
                        >
                            <Image src="/logos/github.svg" width={18} height={18} alt="" />
                            Continuar con GitHub
                        </Button>
                    </div>

                    <p className="pt-1 text-center text-[13px] text-slate-500">
                        ¿Ya tienes una cuenta?{' '}
                        <Link
                            href="/login"
                            className="font-semibold text-slate-900 transition-colors hover:text-[#007BFF]"
                        >
                            Iniciar sesión
                        </Link>
                    </p>
                </form>
            </Form>
        </div>
    );
}
