'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { deleteRule } from '@/app/(auth)/reguly/actions'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { RuleWithClient } from '@/types/database'

interface Props {
  rule: RuleWithClient
  open: boolean
  onClose: () => void
}

export function DeleteRuleDialog({ rule, open, onClose }: Props) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteRule(rule.id)
      toast.success('Reguła usunięta')
      onClose()
    } catch (err) {
      toast.error('Błąd', {
        description: err instanceof Error ? err.message : 'Nieznany błąd',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Usunąć regułę?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              Reguła:{' '}
              <span className="font-mono text-[#1E293B]">
                &quot;{rule.pattern_pozycji.length > 40
                  ? rule.pattern_pozycji.slice(0, 40) + '…'
                  : rule.pattern_pozycji}&quot;
              </span>
            </span>
            <span className="block">
              → &quot;{rule.opis_zdarzenia}&quot;
            </span>
            <span className="block">
              Klient: <span className="font-medium">{rule.client_nazwa}</span> ({rule.client_nip})
            </span>
            <span className="block">
              Użyto: <span className="font-bold">{rule.hit_count}</span> razy
            </span>
            <span className="block mt-2 text-[#F59E0B]">
              Po usunięciu kolejne pozycje o tym patternie trafią do wyjątków jako nierozpoznane.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="cursor-pointer"
          >
            Anuluj
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            className="cursor-pointer"
          >
            {isDeleting ? 'Usuwam...' : 'Usuń regułę 🗑'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
