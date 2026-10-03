import {loadTS} from './load-ts.mjs';
import {z} from 'zod';
// Routes compiled without their imports get a silent notification hook.
const {workspaceOwner,personalRequest}=loadTS('lib/household.ts');
const validators={z,workspaceOwner,personalRequest,...loadTS('lib/api-validation.ts'),recordSchema:loadTS('lib/record-schema.ts').recordSchema,planningSchemas:loadTS('lib/planning-schemas.ts').planningSchemas,queueActionNotification:()=>{},interestKinds:loadTS('lib/finance.ts').interestKinds,interestCompounding:loadTS('lib/finance.ts').interestCompounding};
// Compatibility for older route tests with explicit injected dependencies.
// New tests should use loadTS so the real import graph is tested directly.
export function apiFunction(...args){const names=Object.keys(validators).filter(name=>!args.slice(0,-1).includes(name));return new Function(...names,...args).bind(null,...names.map(name=>validators[name]));}
