import {timingSafeEqual} from 'node:crypto';
/** True when the request carries the cron secret Vercel sends as a Bearer token. */
export function cronAuthorized(req:Request,secret=process.env.CRON_SECRET){
 const authorization=req.headers.get('authorization')??'',expected=secret?'Bearer '+secret:'';
 return !!secret&&Buffer.byteLength(authorization)===Buffer.byteLength(expected)&&timingSafeEqual(Buffer.from(authorization),Buffer.from(expected));
}
