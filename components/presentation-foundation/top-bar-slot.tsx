"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type Slot = {
 /** Where a page's title goes; null until the bar has mounted. */
 title: HTMLElement | null;
 /** Where a page's actions go; null when the bar has no room for them (phones, narrow windows). */
 actions: HTMLElement | null;
 titleRef: (element: HTMLElement | null) => void;
 actionsRef: (element: HTMLElement | null) => void;
};

const TopBarSlotContext = createContext<Slot | null>(null);

/** Lets the top bar lend its title and action areas to the page below it, as a desktop app's title bar does. */
export function TopBarSlotProvider({ children }: { children: ReactNode }) {
 const [title, titleRef] = useState<HTMLElement | null>(null);
 const [actions, actionsRef] = useState<HTMLElement | null>(null);
 const slot = useMemo(() => ({ title, actions, titleRef, actionsRef }), [title, actions]);
 return <TopBarSlotContext.Provider value={slot}>{children}</TopBarSlotContext.Provider>;
}

/** The top bar's areas, or null outside a workspace (sign-in, tests), where a page keeps its own heading. */
export function useTopBarSlot() {
 return useContext(TopBarSlotContext);
}
