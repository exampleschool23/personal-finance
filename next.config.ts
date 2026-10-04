import type { NextConfig } from "next";
// Attachment uploads and downloads go straight between the browser and Supabase Storage (lib/record-attachments.ts).
const supabaseOrigin=(()=>{try{return process.env.SUPABASE_URL?new URL(process.env.SUPABASE_URL).origin:'';}catch{return '';}})();
const connectSources=["'self'",...(supabaseOrigin?[supabaseOrigin]:[])].join(' ');
const nextConfig: NextConfig = {
 async headers(){return [{source:'/:path*',headers:[
 {key:'X-Content-Type-Options',value:'nosniff'},
 // Only this site may frame its pages: the public pages show the app's sample workspace in a frame (lib/app-preview.ts).
 {key:'X-Frame-Options',value:'SAMEORIGIN'},
 // Native sign-in POSTs need their same-origin Origin header for CSRF checks.
 // Continue withholding referrers from external destinations.
 {key:'Referrer-Policy',value:'same-origin'},
 {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
 // Browsers ignore this over plain http, so local development is unaffected; production is https only.
 ...(process.env.NODE_ENV==='production'?[{key:'Strict-Transport-Security',value:'max-age=63072000; includeSubDomains'}]:[]),
 // Still report-only: violations show in the browser console and nothing is blocked yet.
 {key:'Content-Security-Policy-Report-Only',value:`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src ${connectSources}; frame-ancestors 'self'; base-uri 'self'; form-action 'self'`}
 ]}];}
};
export default nextConfig;
