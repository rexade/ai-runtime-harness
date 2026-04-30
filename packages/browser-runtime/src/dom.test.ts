import { describe, it, expect, beforeEach } from 'vitest'
import { DomModule } from './dom'

describe('DomModule', () => {
  let dom: DomModule

  beforeEach(() => {
    dom = new DomModule()
    document.body.innerHTML = `
      <div id="root">
        <button id="btn" class="primary">Click me</button>
        <input id="name" placeholder="Name" />
      </div>
    `
  })

  it('serializes DOM tree from root', () => {
    const snapshot = dom.getTree()
    expect(snapshot.tag).toBe('body')
    const root = snapshot.children.find(c => c.id === 'root')
    expect(root).toBeDefined()
    expect(root!.children).toHaveLength(2)
  })

  it('serializes a subtree by selector', () => {
    const snapshot = dom.getTree('#root')
    expect(snapshot.tag).toBe('div')
    expect(snapshot.id).toBe('root')
  })

  it('returns text content', () => {
    const snapshot = dom.getTree('#btn')
    expect(snapshot.text).toBe('Click me')
  })

  it('dispatches a click event', () => {
    let clicked = false
    document.getElementById('btn')!.addEventListener('click', () => { clicked = true })
    dom.click('#btn')
    expect(clicked).toBe(true)
  })

  it('types text into an input', () => {
    dom.type('#name', 'Henri')
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('Henri')
  })
})
