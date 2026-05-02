// Public-safe Supabase config. The anon key is designed to ship in the browser;
// Row Level Security (see supabase/schema.sql) is what protects your data.
//
// To swap projects, replace these with values from:
//   Supabase Dashboard -> Project Settings -> API
//     - "Project URL"                              -> SUPABASE_URL
//     - "Project API keys" -> "anon" / "public"    -> SUPABASE_ANON_KEY

export const SUPABASE_URL = 'https://dkdrhfwlknctmhnuaeop.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrZHJoZndsa25jdG1obnVhZW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NDgzNTYsImV4cCI6MjA5MzMyNDM1Nn0.4DqQlGqPWNTHGMhmouT8iBw8oErOmBlnc_j0wLYwlao';

export const isConfigured = () =>
  !!SUPABASE_URL &&
  !!SUPABASE_ANON_KEY &&
  !SUPABASE_URL.startsWith('YOUR_') &&
  !SUPABASE_ANON_KEY.startsWith('YOUR_');
