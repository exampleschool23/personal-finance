"use client"

import * as React from "react"

/** The element that had focus when a dialog opened. Most dialogs here open from state, without a Radix trigger to return to. */
export function useReturnFocus(onCloseAutoFocus?: (event: Event) => void) {
  const [opener] = React.useState(() => typeof document === "undefined" ? null : document.activeElement)
  return (event: Event) => {
    onCloseAutoFocus?.(event)
    if (event.defaultPrevented) return
    event.preventDefault()
    if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true })
  }
}
