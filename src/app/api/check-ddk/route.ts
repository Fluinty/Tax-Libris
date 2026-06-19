import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy do FluintyBridge — sprawdza czy DDK (dokument do księgowania)
 * nadal czeka na zaksięgowanie. Token Bridge nigdy nie trafia do przeglądarki.
 *
 * GET /api/check-ddk?nip=1234567890&ddk=12345
 * → { isPending: true/false }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const nip = searchParams.get('nip')
  const ddk = searchParams.get('ddk')

  if (!nip || !ddk) {
    return NextResponse.json({ error: 'Brak parametrów nip/ddk' }, { status: 400 })
  }

  const bridgeUrl = process.env.FLUINTY_BRIDGE_URL || 'http://localhost:5000'
  const bridgeToken = process.env.FLUINTY_BRIDGE_TOKEN

  if (!bridgeToken) {
    return NextResponse.json({ error: 'Brak konfiguracji Bridge (FLUINTY_BRIDGE_TOKEN)' }, { status: 500 })
  }

  try {
    const res = await fetch(`${bridgeUrl}/clients/${nip}/ddk/${ddk}/is-pending`, {
      headers: { 'X-Fluinty-Token': bridgeToken },
      signal: AbortSignal.timeout(5000), // 5s timeout
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Bridge zwrócił ${res.status}`, isPending: false },
        { status: 502 }
      )
    }

    const data = await res.json()
    return NextResponse.json({ isPending: !!data.isPending })
  } catch (err: any) {
    return NextResponse.json(
      { error: `Bridge nieosiągalny: ${err.message}` },
      { status: 502 }
    )
  }
}
