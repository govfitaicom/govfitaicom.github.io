import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yhgqtbbxsbptssybgbrl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloZ3F0YmJ4c2JwdHNzeWJnYnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1OTQ4NDYsImV4cCI6MjA4MTE3MDg0Nn0.cktVnZkay3MjYIG_v0WJSkotyq79Nnkr3JJn_munDi8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface Job {
  id: string;
  title: string;
  organization: string;
  post_name: string;
  education_required: string;
  education_fields: string[];
  state: string;
  min_age: string;
  max_age: string;
  min_percentage: string;
  categories: string[];
  application_start_date: string;
  application_deadline: string;
  posted_date: string;
  admit_card_date: string;
  result_date: string;
  apply_link: string;
  description: string;
  additional_requirements: string;
}

export interface QuizQuestion {
  id: string;
  question_en: string;
  question_hi: string;
  options_en: string[];
  options_hi: string[];
  correct_option: number;
  explanation: string;
  category: string;
  posted_date: string;
}

const BLOCKED_JOB_IDS = new Set([
  '3528e1aa-e255-4d09-b388-4281e5ac9792',
  'eeed74d0-2802-43d8-ae35-0d1375ee8417'
]);

function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\p{L}\p{M}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBlockedJob(job: Job): boolean {
  if (!job) return true;
  if (BLOCKED_JOB_IDS.has(job.id || '')) return true;

  const title = normalizeText(job.title);
  const organization = normalizeText(job.organization);
  const postName = normalizeText(job.post_name);
  const combined = normalizeText(`${title} ${organization} ${postName}`);

  if (title === 'scc test' && organization === 'scc test') return true;
  if (title === 'it jobs' && organization === 'it jobs') return true;
  if (combined.includes('dhruv rathi free ai masterclass')) return true;
  if (combined.includes('dhruv rathee free ai masterclass')) return true;

  return false;
}

/**
 * Fetch all jobs from Supabase, filtering out blocked ones.
 * Fetches in batches of 1000 to handle pagination.
 */
export async function fetchJobs(): Promise<Job[]> {
  const allJobs: Job[] = [];
  const limit = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('posted_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error(`Supabase jobs fetch error at offset ${offset}:`, error.message);
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allJobs.push(...data);
      offset += limit;
      if (data.length < limit) hasMore = false;
    }
  }

  console.log(`Fetched ${allJobs.length} total jobs from Supabase`);
  return allJobs.filter((job) => !isBlockedJob(job));
}

/**
 * Fetch all quiz questions from Supabase.
 */
export async function fetchQuizQuestions(): Promise<QuizQuestion[]> {
  const allQuestions: QuizQuestion[] = [];
  const limit = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('quiz_questions')
      .select('*')
      .order('posted_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error(`Supabase quiz fetch error at offset ${offset}:`, error.message);
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allQuestions.push(...data);
      offset += limit;
      if (data.length < limit) hasMore = false;
    }
  }

  console.log(`Fetched ${allQuestions.length} quiz questions from Supabase`);
  return allQuestions;
}
