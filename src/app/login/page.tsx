'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles, Loader2, Mail, Lock } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-[#1F3A5F] via-[#1a3255] to-[#152A45]" />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const supabase = createSupabaseBrowserClient()

  const authError = searchParams.get('error')

  const handleLogin = async () => {
    setErrorMsg('')

    if (!email.trim() || !password) {
      setErrorMsg('Podaj email i hasło')
      return
    }

    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        setErrorMsg('Nieprawidłowy email lub hasło')
        setPassword('')
        return
      }
      router.replace('/do-akceptacji?typ=all')
    } catch {
      setErrorMsg('Wystąpił nieoczekiwany błąd. Spróbuj ponownie.')
      setPassword('')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleLogin()
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

          <div className="space-y-5">
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="h-11 pl-10 rounded-lg border-[#E2E8F0] focus:border-[#4A90E2] focus:ring-[#4A90E2]/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#1E293B] font-medium">
                Hasło
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="h-11 pl-10 rounded-lg border-[#E2E8F0] focus:border-[#4A90E2] focus:ring-[#4A90E2]/20"
                />
              </div>
            </div>

            {errorMsg && (
              <p className="text-sm text-[#EF4444]">{errorMsg}</p>
            )}

            <Button
              type="button"
              disabled={isLoading}
              onClick={handleLogin}
              className="w-full h-11 bg-[#1F3A5F] hover:bg-[#152A45] text-white rounded-lg font-medium text-base transition-all duration-200 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Logowanie…
                </>
              ) : (
                'Zaloguj'
              )}
            </Button>
          </div>

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
