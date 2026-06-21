// Create/reset test accounts (a professor + a student) directly in the DB and
// wire them to the seeded demo course. Idempotent: re-running resets them.
//
// We insert into auth.users/auth.identities directly (with a bcrypt-hashed
// password via pgcrypto) instead of the signup API, because Supabase's signup
// flow enforces email-domain validation + a low confirmation-email rate limit.
//
// Usage (PowerShell):
//   $env:DATABASE_URL="postgresql://postgres:<PASSWORD>@db.<ref>.supabase.co:5432/postgres"
//   node setup-accounts.js
//
// Run the SQL migrations FIRST (supabase-migration.sql, migration2.sql, migration3.sql).

const { Client } = require('pg');

const DEMO_COURSE = '00000000-0000-0000-0000-000000000001';
const ACCOUNTS = [
  { email: 'notebookmind.prof@gmail.com', password: 'Teacher123!', name: 'Prof. Test', role: 'teacher' },
  { email: 'notebookmind.student@gmail.com', password: 'Student123!', name: 'Test Student', role: 'student' }
];

if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL (postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres).');
  process.exit(1);
}
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  await c.connect();
  await c.query('begin');
  for (const a of ACCOUNTS) {
    await c.query('delete from auth.users where email=$1', [a.email]); // cascades to identities + profiles
    const u = await c.query(
      `insert into auth.users
         (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
          raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
          confirmation_token,recovery_token,email_change_token_new,email_change,
          email_change_token_current,reauthentication_token)
       values
         ('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
          $1,crypt($2,gen_salt('bf')),now(),
          '{"provider":"email","providers":["email"]}',jsonb_build_object('display_name',$3::text),now(),now(),
          '','','','','','')
       returning id`,
      [a.email, a.password, a.name]
    );
    const id = u.rows[0].id;
    await c.query(
      `insert into auth.identities (provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
       values ($1::text,$1::uuid,jsonb_build_object('sub',$1::text,'email',$2::text),'email',now(),now(),now())`,
      [id, a.email]
    );
    // profiles row is auto-created by the handle_new_user trigger; set role + name.
    await c.query('update public.profiles set role=$1, display_name=$2 where user_id=$3', [a.role, a.name, id]);
  }
  // Professor owns the demo course; student is enrolled.
  await c.query('update public.courses set teacher_id=(select id from auth.users where email=$1) where id=$2',
    [ACCOUNTS[0].email, DEMO_COURSE]);
  await c.query(
    'insert into public.course_enrollments(user_id,course_id) select id,$2 from auth.users where email=$1 on conflict do nothing',
    [ACCOUNTS[1].email, DEMO_COURSE]);
  await c.query('commit');

  const v = await c.query(
    'select u.email, p.role, p.display_name from auth.users u join public.profiles p on p.user_id=u.id order by p.role');
  console.log('Accounts:');
  for (const r of v.rows) console.log(`  ${r.email.padEnd(34)}${r.role.padEnd(9)}${r.display_name}`);
  await c.end();
})().catch(async e => { try { await c.query('rollback'); } catch {} console.error('ERR:', e.message); process.exit(1); });
