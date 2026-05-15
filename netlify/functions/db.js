// netlify/functions/db.js
// BRUNO360 Business Cleaning Suite — Supabase Proxy
// Lemora Solutions
 
const { createClient } = require('@supabase/supabase-js');
 
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};
 
const ok  = (data)          => ({ statusCode: 200, headers: CORS, body: JSON.stringify({ success: true,  data }) });
const err = (msg, code=400) => ({ statusCode: code, headers: CORS, body: JSON.stringify({ success: false, error: msg }) });
 
exports.handler = async (event) => {
 
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return err('Method not allowed', 405);
 
  // Debug: log env vars presence (never log values)
  console.log('SUPABASE_URL present:', !!process.env.SUPABASE_URL);
  console.log('SUPABASE_SERVICE_KEY present:', !!process.env.SUPABASE_SERVICE_KEY);
 
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
 
  if (!supabaseUrl || !supabaseKey) {
    return err('Missing Supabase environment variables', 500);
  }
 
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
 
  let body;
  try { body = JSON.parse(event.body); }
  catch { return err('Invalid JSON'); }
 
  const { action, table, data, id, filters } = body;
 
  try {
 
    // ── getAll ──────────────────────────────────────────────
    if (action === 'getAll') {
      let q = supabase.from(table).select('*');
      if (filters) {
        for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      }
      const { data: rows, error } = await q;
      if (error) throw error;
      return ok(rows || []);
    }
 
    // ── getOne ──────────────────────────────────────────────
    if (action === 'getOne') {
      const { data: row, error } = await supabase
        .from(table).select('*').eq('id', id).single();
      if (error) throw error;
      return ok(row);
    }
 
    // ── insert ──────────────────────────────────────────────
    if (action === 'insert') {
      const { data: row, error } = await supabase
        .from(table).insert(data).select().single();
      if (error) throw error;
      return ok(row);
    }
 
    // ── upsert ──────────────────────────────────────────────
    if (action === 'upsert') {
      const { data: row, error } = await supabase
        .from(table).upsert(data).select().single();
      if (error) throw error;
      return ok(row);
    }
 
    // ── update ──────────────────────────────────────────────
    if (action === 'update') {
      const { data: row, error } = await supabase
        .from(table).update(data).eq('id', id).select().single();
      if (error) throw error;
      return ok(row);
    }
 
    // ── delete ──────────────────────────────────────────────
    if (action === 'delete') {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return ok({ deleted: id });
    }
 
    // ── deleteWhere ──────────────────────────────────────────
    if (action === 'deleteWhere') {
      if (!filters) return err('deleteWhere requires filters');
      let q = supabase.from(table).delete();
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      const { error } = await q;
      if (error) throw error;
      return ok({ deleted: true });
    }
 
    // ── login ────────────────────────────────────────────────
    // FIX: isActive column uses camelCase with quotes in DB
    if (action === 'login') {
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', data.email)
        .eq('password', data.password);
      if (error) throw error;
      // Filter isActive in JS to avoid column quoting issues
      const user = (users || []).find(u => u.isActive !== false);
      return ok(user || null);
    }
 
    // ── loadAll ──────────────────────────────────────────────
    if (action === 'loadAll') {
      const tables = [
        'customers','addresses','vendors','services','stores',
        'jobs','calendar','estimates','estimate_lines','invoices','invoice_lines',
        'payments','expenses','bills','inventory','tasks','users',
        'employees','teams','contractors','audits'
      ];
      const [companyRes, catalogsRes, ...tableResults] = await Promise.all([
        supabase.from('company').select('*').eq('id','COMPANY').single(),
        supabase.from('catalogs').select('data').eq('id','CATALOGS').single(),
        ...tables.map(t => supabase.from(t).select('*'))
      ]);
 
      const result = {
        company:  companyRes.data        || {},
        catalogs: catalogsRes.data?.data || {},
      };
      tables.forEach((t, i) => { result[t] = tableResults[i].data || []; });
      return ok(result);
    }
 
    // ── updateCompany ─────────────────────────────────────────
    if (action === 'updateCompany') {
      const { data: row, error } = await supabase
        .from('company').update(data).eq('id','COMPANY').select().single();
      if (error) throw error;
      return ok(row);
    }
 
    // ── updateCatalogs ────────────────────────────────────────
    if (action === 'updateCatalogs') {
      const { data: row, error } = await supabase
        .from('catalogs').update({ data }).eq('id','CATALOGS').select().single();
      if (error) throw error;
      return ok(row);
    }
 
    // ── auditLog ──────────────────────────────────────────────
    if (action === 'auditLog') {
      const { error } = await supabase.from('audit_log').insert({
        userId:   data.userId,
        userName: data.userName,
        module:   data.module,
        action:   data.action,
        recordId: data.recordId,
        before:   data.before || null,
        after:    data.after  || null
      });
      if (error) throw error;
      return ok({ logged: true });
    }
 
    return err(`Unknown action: ${action}`);
 
  } catch (e) {
    console.error('DB proxy error:', e.message);
    return err(e.message, 500);
  }
};
 
