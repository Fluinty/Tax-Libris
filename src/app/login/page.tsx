'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sparkles, Loader2, Mail, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { checkWhitelist } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

const loginSchema = z.object({
  email: z.string().email('Podaj prawidłowy adres email'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-[#1F3A5F] via-[#1a3255] to-[#152A45]" />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')
  const supabase = createSupabaseBrowserClient()

  const authError = searchParams.get('error')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    try {
      // 1. Check whitelist BEFORE sending magic link
      const { allowed, error: whitelistError } = await checkWhitelist(data.email)

      if (!allowed) {
        toast.error('Brak dostępu', {
          description: whitelistError || 'Ten email nie ma dostępu do panelu.',
        })
        return
      }

      // 2. Send magic link
      const redirectTo = `${window.location.origin}/auth/callback`

      const { error } = await supabase.auth.signInWithOtp({
        email: data.email,
        options: {
          emailRedirectTo: redirectTo,
        },
      })

      if (error) {
        toast.error('Błąd wysyłania linku', {
          description: error.message,
        })
        return
      }

      // 3. Success — show "check your email" state
      setSentEmail(data.email)
      setEmailSent(true)
      toast.success('Link wysłany!')
    } catch {
      toast.error('Wystąpił nieoczekiwany błąd')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[#1F3A5F] via-[#1a3255] to-[#152A45]">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-[#4A90E2]/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-[#4A90E2]/5 blur-3xl" />
      </div>

      <Card className="w-full max-w-md shadow-2xl border-0 rounded-2xl relative z-10">
        <CardHeader className="text-center pb-2 pt-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="w-7 h-7 text-[#1F3A5F]" />
            <h1 className="text-3xl font-bold text-[#1F3A5F] tracking-tight">
              Fluinty
            </h1>
          </div>
          <p className="text-sm text-[#64748B]">Panel wyjątków KSeF</p>
        </CardHeader>

        <CardContent className="px-8 pb-8 pt-4">
          {authError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              Wystąpił błąd logowania. Spróbuj ponownie.
            </div>
          )}

          {emailSent ? (
            /* SUCCESS STATE — check your email */
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-[#4A90E2]/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-[#4A90E2]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#1E293B]">
                  Sprawdź skrzynkę email
                </h2>
                <p className="text-sm text-[#64748B] mt-2">
                  Wysłaliśmy link logowania na:
                </p>
                <p className="text-sm font-medium text-[#1F3A5F] mt-1">
                  {sentEmail}
                </p>
              </div>
              <div className="pt-2">
                <p className="text-xs text-[#94A3B8]">
                  Kliknij link w wiadomości — zostaniesz automatycznie zalogowany/a.
                </p>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Link ważny 1 godzinę. Nie widzisz maila? Sprawdź SPAM.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEmailSent(false)
                  setSentEmail('')
                }}
                className="mt-4 text-sm cursor-pointer"
              >
                Wyślij ponownie
              </Button>
            </div>
          ) : (
            /* LOGIN FORM */
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[#1E293B] font-medium">
                  Adres email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="monika@taxlibris.pl"
                    autoComplete="email"
                    autoFocus
                    {...register('email')}
                    className="h-11 pl-10 rounded-lg border-[#E2E8F0] focus:border-[#4A90E2] focus:ring-[#4A90E2]/20"
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-[#EF4444]">{errors.email.message}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-[#1F3A5F] hover:bg-[#152A45] text-white rounded-lg font-medium text-base transition-all duration-200 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Wysyłanie...
                  </>
                ) : (
                  'Wyślij link logowania'
                )}
              </Button>

              <p className="text-xs text-center text-[#94A3B8] mt-2">
                Otrzymasz email z jednorazowym linkiem do logowania.
                <br />
                Bez hasła — bezpiecznie i szybko.
              </p>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-xs text-[#64748B]">
              Nie masz dostępu?{' '}
              <span className="text-[#4A90E2]">
                Skontaktuj się z administratorem
              </span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
