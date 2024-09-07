import { Plugin } from 'obsidian'
import type { EditorView, PluginValue, ViewUpdate } from '@codemirror/view'
import { ViewPlugin } from '@codemirror/view'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

class SomeViewPlugin implements PluginValue {
  private view: EditorView

  constructor(view: EditorView) {
    this.view = view

    this.init()
  }

  update(update: ViewUpdate) {
    if (!update.docChanged || !update.viewportChanged)
      return

    // eslint-disable-next-line no-console
    console.log('update', update)
  }

  destroy(): void {
    // eslint-disable-next-line no-console
    console.log('destroy')
  }

  async init() {
    await this.waitForViewDOM()

    // eslint-disable-next-line no-console
    console.log('view ready', this.view.dom)
  }

  async waitForViewDOM(seconds: number = 5) {
    let i = 0

    while (!this.view || !this.view.dom) {
      await sleep(1000)

      i++
      if (i > seconds)
        return
    }
  }
}

export default class SomePlugin extends Plugin {
  async onload() {
    const editorPlugins = ViewPlugin.define(view => new SomeViewPlugin(view))

    this.registerEditorExtension(editorPlugins)
  }
}
