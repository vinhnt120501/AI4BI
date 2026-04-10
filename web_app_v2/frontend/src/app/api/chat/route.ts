const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8005';

export async function POST(request: Request) {
    const body = await request.json();

    const upstream = await fetch(`${BACKEND_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!upstream.body) {
        return new Response(JSON.stringify({ error: 'No stream from backend' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response(upstream.body, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
