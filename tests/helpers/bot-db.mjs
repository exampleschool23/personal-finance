// A small in-memory stand-in for the REST tables the Telegram bot touches. It
// understands the filters the bot uses (eq, is.null, gt, lt) and upserts by user.
export function botDb(seed = {}) {
  const tables = { telegram_subscriptions: [], user_preferences: [], telegram_drafts: [], telegram_login_tokens: [], telegram_connect_requests: [], finance_records: [], transaction_categories: [], payment_occurrences: [], account_activity: [], mortgage_payments: [], portfolio_snapshots: [], ...structuredClone(seed) };
  const writes = [], rpcs = [];
  const failures = new Set(seed.__fail ?? []);
  const filters = path => [...new URLSearchParams(path.split('?')[1] ?? '').entries()].filter(([key]) => !['select', 'on_conflict', 'order', 'limit', 'offset'].includes(key));
  const table = path => path.split('?')[0].replace('/rest/v1/', '');
  const matches = (row, [key, value]) => {
    if (value.startsWith('eq.')) return String(row[key] ?? '') === decodeURIComponent(value.slice(3));
    if (value === 'is.null') return row[key] === null || row[key] === undefined;
    if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key] ?? ''));
    if (value.startsWith('gt.')) return Date.parse(row[key]) > Date.parse(decodeURIComponent(value.slice(3)));
    if (value.startsWith('lt.')) return Date.parse(row[key]) < Date.parse(decodeURIComponent(value.slice(3)));
    throw Error('unexpected filter ' + key + '=' + value);
  };
  const select = path => tables[table(path)].filter(row => filters(path).every(filter => matches(row, filter)));
  return {
    tables, writes, rpcs,
    fail: name => failures.add(name),
    async read(path) {
      if (failures.has(table(path))) throw Error('Database request failed.');
      if (!(table(path) in tables)) throw Error('unexpected read ' + path);
      return structuredClone(select(path));
    },
    async write(path, init = {}) {
      const body = init.body ? JSON.parse(init.body) : null;
      writes.push({ path, method: init.method, body, headers: init.headers });
      if (path.startsWith('/rest/v1/rpc/')) {
        rpcs.push({ name: path.replace('/rest/v1/rpc/', ''), body });
        return failures.has('rpc') ? Response.json({ message: 'refused' }, { status: 400 }) : Response.json([{}]);
      }
      const name = table(path);
      if (failures.has(name)) return new Response(null, { status: 500 });
      const rows = tables[name];
      if (init.method === 'DELETE') { for (const row of select(path)) rows.splice(rows.indexOf(row), 1); return new Response(null, { status: 204 }); }
      if (init.method === 'PATCH') {
        const changed = select(path);
        for (const row of changed) Object.assign(row, body);
        return init.headers?.Prefer?.includes('return=representation') ? Response.json(structuredClone(changed)) : new Response(null, { status: 204 });
      }
      // Only the per-owner tables are keyed by user; tokens are many per owner.
      const keyed = ['telegram_subscriptions', 'user_preferences', 'telegram_drafts'].includes(name);
      const existing = keyed ? rows.find(row => row.user_id === body.user_id) : undefined;
      if (existing) Object.assign(existing, body); else rows.push({ ...body });
      return new Response(null, { status: 201 });
    },
  };
}
export const ownerId = '11111111-1111-4111-8111-111111111111';
export const subscription = (extra = {}) => ({ user_id: ownerId, chat_id: 500, digest_enabled: true, actions_enabled: true, linked_at: '2026-09-29T00:00:00Z', telegram_user_id: null, phone: null, first_name: null, consented_at: null, ...extra });
