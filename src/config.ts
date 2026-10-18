/** Supabase project for the family's data. Both values are designed to be public:
 *  the database only lets in logins listed in its `members` table (see supabase/setup.sql). */
export const SUPABASE_URL = 'https://bcmfghlfzywwzkezhmde.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_eNnfeHtkr0J-_jYzkMjVyQ_JBkNiKSd';

/** Add ?demo to the address to try the app with data kept only in this browser. */
export const isDemo = () =>
  typeof window !== 'undefined' && (new URLSearchParams(window.location.search).has('demo') || localStorage.getItem('fb:mode') === 'local');
