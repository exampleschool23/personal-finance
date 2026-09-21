import {loadTS} from './load-ts.mjs';
import {z} from 'zod';
const validators={z,...loadTS('lib/api-validation.ts')};
// Compatibility for older route tests with explicit injected dependencies.
// New tests should use loadTS so the real import graph is tested directly.
export function apiFunction(...args){const names=Object.keys(validators).filter(name=>!args.slice(0,-1).includes(name));return new Function(...names,...args).bind(null,...names.map(name=>validators[name]));}
