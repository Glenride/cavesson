// Shared jsdom stubs for UI SDK web components, per the ui-sdk testing
// reference: popover, animations, layout, and form-associated internals
// that jsdom does not implement. Call installStubs() before importing
// any @ui-sdk/web entry.
export function installStubs() {
  if (globalThis.__cavessonStubsInstalled) return
  globalThis.__cavessonStubsInstalled = true
  HTMLElement.prototype.showPopover = function () {}
  HTMLElement.prototype.hidePopover = function () {}
  Element.prototype.getAnimations = () => []
  Element.prototype.scrollIntoView = function () {}
  Element.prototype.checkVisibility = () => true
  Element.prototype.getClientRects = () => []
  document.elementFromPoint = () => null
  document.elementsFromPoint = () => []
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const origAttach = HTMLElement.prototype.attachInternals
  HTMLElement.prototype.attachInternals = function () {
    let internals
    try {
      internals = origAttach.call(this)
    } catch {
      internals = {}
    }
    internals.setFormValue ??= () => {}
    internals.setValidity ??= () => {}
    internals.checkValidity ??= () => true
    internals.reportValidity ??= () => true
    internals.states ??= new Set()
    return internals
  }
  const style = document.createElement("style")
  style.textContent = "[popover] { position: fixed; inset: 0; margin: auto; }"
  document.head.appendChild(style)
}

export const tick = () => new Promise((r) => setTimeout(r, 0))
export const ticks = async (n = 3) => {
  for (let i = 0; i < n; i++) await tick()
}
