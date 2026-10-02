import { demoWorkspace } from '@/lib/demo-finance';
import { depositToday } from '@/lib/deposit-interest';

// The sample workspace is served by the backend, so every visitor starts from the same dated data.
export function GET() {
 return Response.json(demoWorkspace(depositToday()), { headers: { 'Cache-Control': 'no-store' } });
}
