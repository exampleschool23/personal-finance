"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** An on/off switch; its look follows the app theme tokens in globals.css (`.switch`). */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root data-slot="switch" className={cn("switch", className)} {...props}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className="switch-thumb" />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
