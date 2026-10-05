"use client";

import { createContext, useContext } from 'react';
import { categoryEmoji } from '@/lib/category-icons';

/** The icon shown for a category. The workspace provides the icons people chose; outside it, the defaults. */
export const CategoryIconsContext = createContext<(kind: string) => string>(categoryEmoji);

/** Resolves a category (a built-in name, an added category's id or its name) to the icon to show. */
export const useCategoryEmoji = () => useContext(CategoryIconsContext);
