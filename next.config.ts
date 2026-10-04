import type { NextConfig } from "next";
const nextConfig: NextConfig = {
 async headers(){return [{source:'/:path*',headers:[
 {key:'X-Content-Type-Options',value:'nosniff'},
 // Only this site may frame its pages: the public pages show the app's sample workspace in a frame (lib/app-preview.ts).
 {key:'X-Frame-Options',value:'SAMEORIGIN'},
 // Native sign-in POSTs need their same-origin Origin header for CSRF checks.
 // Continue withholding referrers from external destinations.
 {key:'Referrer-Policy',value:'same-origin'},
 {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
 {key:'Content-Security-Policy-Report-Only',value:"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"}
 ]}];}
};
export default nextConfig;
