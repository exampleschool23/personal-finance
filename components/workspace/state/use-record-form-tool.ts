"use client";
import { useEffect } from 'react';

type ModelContext = { registerTool: (tool: unknown, options: unknown) => void };

/** Offers a browser's assistant (WebMCP's `document.modelContext`) one tool: opening the record form. It never saves;
 * the person does. Outside a session it refuses. */
export function useRecordFormTool({ user, demo, openForm }: { user: string | null; demo: boolean; openForm: () => void }) {
    useEffect(() => {
        const ctx = (document as unknown as { modelContext?: ModelContext }).modelContext;
        if (!ctx) return;
        const controller = new AbortController();
        try {
            ctx.registerTool({ name: 'start_finance_record', description: 'Open the finance record form. Does not save a record.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false }, execute: (input: unknown) => {
                if (!input || typeof input !== 'object' || Object.keys(input).length) throw Error('No fields accepted.');
                if (!user && !demo) throw Error('Sign in first.');
                openForm(); return { status: 'form_opened' };
            } }, { signal: controller.signal });
        }
        catch { }
        return () => controller.abort();
    }, [user, demo]); // eslint-disable-line react-hooks/exhaustive-deps
}
