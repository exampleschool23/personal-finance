"use client";
import dynamic from 'next/dynamic';

/** The investment tracker, loaded when a payment opens it. It draws its history with the chart library, so the
 * workspace shell, the record dialog and the public landing page stay without the charts until then. */
export const InvestmentTracker = dynamic(() => import('@/components/investment-tracker').then(module => module.InvestmentTracker), { ssr: false });
