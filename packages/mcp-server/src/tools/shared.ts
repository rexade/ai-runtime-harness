export function textResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  }
}

export function ok(result: unknown) {
  return textResult(JSON.stringify(result ?? null, null, 2))
}

export function notConnected() {
  return textResult('No browser connected. Open the app with the harness armed first.')
}
