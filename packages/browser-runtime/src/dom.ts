import type { DomSnapshot } from '@ai-runtime-harness/protocol'

export class DomModule {
  getTree(selector?: string): DomSnapshot {
    const root = selector ? document.querySelector(selector) : document.body
    if (!root) throw new Error(`Element not found: ${selector}`)
    return this.serializeNode(root as Element)
  }

  private serializeNode(el: Element, depth = 0): DomSnapshot {
    const attrs: Record<string, string> = {}
    for (const attr of Array.from(el.attributes)) {
      attrs[attr.name] = attr.value
    }
    const children = depth < 5
      ? Array.from(el.children).map(c => this.serializeNode(c, depth + 1))
      : []
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      className: el.className || undefined,
      text: el.children.length === 0 ? el.textContent?.trim() || undefined : undefined,
      attrs,
      children,
    }
  }

  click(selector: string) {
    const el = document.querySelector(selector)
    if (!el) throw new Error(`Element not found: ${selector}`)
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  }

  type(selector: string, text: string) {
    const el = document.querySelector(selector) as HTMLInputElement | null
    if (!el) throw new Error(`Element not found: ${selector}`)
    el.focus()
    el.value = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  scroll(selector: string, amount: number) {
    const el = document.querySelector(selector)
    if (!el) throw new Error(`Element not found: ${selector}`)
    el.scrollTop += amount
  }

  hover(selector: string) {
    const el = document.querySelector(selector)
    if (!el) throw new Error(`Element not found: ${selector}`)
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
  }

  navigate(url: string) {
    window.location.href = url
  }
}
