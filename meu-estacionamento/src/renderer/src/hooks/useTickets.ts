import { useState, useEffect, useCallback } from 'react'
import { getTickets } from '../services/tickets'
import type { Ticket } from '../types/domain'

export function useTickets(): {
  tickets: Ticket[]
  reload: () => Promise<void>
  tick: number
} {
  const [tickets, setTickets] = useState<Ticket[]>([])
  // D-09: tick counter força re-render para atualizar tempo decorrido sem clonar array
  const [tick, setTick] = useState<number>(0)

  const reload = useCallback(async (): Promise<void> => {
    try {
      const data = await getTickets()
      setTickets(data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  return { tickets, reload, tick }
}
