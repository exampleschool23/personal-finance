"use client"

import * as React from "react"

/** Where focus goes back to: the element focused when the dialog opened, or, when that was a menu item (it unmounts with its
 * menu), the button that opened the menu, which Radix names in the menu's `aria-labelledby`. */
function openerOf(active: Element | null) {
  const menu = active?.closest?.("[role=menu]")
  const trigger = menu && document.getElementById(menu.getAttribute("aria-labelledby") ?? "")
  return trigger ?? active
}

/** Focus goes back where it was when the dialog opened. Most dialogs here open from state, without a Radix trigger to return to,
 * and some stay mounted while closed (ConfirmDialog, the Recurring delete question), so the opener is read each time the dialog
 * opens (`onOpenAutoFocus`, before focus moves in), not once when the component first renders. */
export function useReturnFocus(onCloseAutoFocus?: (event: Event) => void, onOpenAutoFocus?: (event: Event) => void) {
  const [initial] = React.useState(() => typeof document === "undefined" ? null : openerOf(document.activeElement))
  const opener = React.useRef(initial)
  return {
    onOpenAutoFocus: (event: Event) => {
      opener.current = openerOf(document.activeElement)
      onOpenAutoFocus?.(event)
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event)
      if (event.defaultPrevented) return
      event.preventDefault()
      const target = opener.current
      if (target instanceof HTMLElement && target !== document.body && target.isConnected) target.focus({ preventScroll: true })
    },
  }
}
