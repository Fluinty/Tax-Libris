'use client'

import { useState } from 'react'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { FakturaEventsDrawer } from '@/components/do-akceptacji/sections/FakturaEventsDrawer'

interface FakturaHistoryButtonProps {
  queueId?: number
  fakturaId?: number
  currentStatus?: string
  ksiegoweNumer?: string | null
  nazwaDostawcy?: string | null
}

export function FakturaHistoryButton({
  queueId,
  fakturaId,
  currentStatus,
  ksiegoweNumer,
  nazwaDostawcy,
}: FakturaHistoryButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <TooltipProvider delay={300}>
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-slate-600"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(true)
              }}
            >
              <History className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Historia faktury</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {open && (
        <FakturaEventsDrawer
          open={open}
          onOpenChange={setOpen}
          queueId={queueId}
          fakturaId={fakturaId}
          currentStatus={currentStatus}
          ksiegoweNumer={ksiegoweNumer}
          nazwaDostawcy={nazwaDostawcy}
        />
      )}
    </>
  )
}
