"use client";

import { createContext, useContext } from 'react';
import { categoryEmoji } from '@/lib/category-icons';
import { categoryHue } from '@/lib/category-colors';

/** The icon shown for a category. The workspace provides the icons people chose; outside it, the defaults. */
export const CategoryIconsContext = createContext<(kind: string) => string>(categoryEmoji);
/** The hue shown for a category. The workspace provides the colours people chose; outside it, the defaults. */
export const CategoryHueContext = createContext<(kind: string) => number>(categoryHue);

/** Resolves a category (a built-in name, an added category's id or its name) to the icon to show. */
export const useCategoryEmoji = () => useContext(CategoryIconsContext);
/** Resolves a category the same way to the hue to tint it with. */
export const useCategoryHue = () => useContext(CategoryHueContext);
