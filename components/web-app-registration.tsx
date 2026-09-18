"use client";
import {useEffect} from 'react';
export function WebAppRegistration(){useEffect(()=>{if(process.env.NODE_ENV==='production'&&'serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});}},[]);return null;}
