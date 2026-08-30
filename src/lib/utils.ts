import type { Job, QuizQuestion } from './supabase';

const SITE_URL = 'https://govfitai.com';

// ── TEXT HELPERS ─────────────────────────────────────────────────────────
export function asText(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || fallback;
  return String(value).trim() || fallback;
}

export function escapeHtml(value: unknown): string {
  return asText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripHtml(value: unknown): string {
  return asText(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanQuestionText(value: unknown): string {
  return asText(value).replace(/\bAnonymous Quiz\b/gi, ' ').replace(/\s+/g, ' ').trim();
}

// ── DATE HELPERS ────────────────────────────────────────────────────────
export function formatDate(value: unknown): string {
  if (!value) return 'Not specified';
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return asText(value, 'Not specified');
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function isoDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

export function firstValidDate(values: unknown[], mode: 'latest' | 'earliest' = 'latest'): string {
  const dates = values
    .map((v) => ({ value: v, time: new Date(v as string).getTime() }))
    .filter((item) => typeof item.time === 'number' && !Number.isNaN(item.time));
  if (!dates.length) return '';
  dates.sort((a, b) => mode === 'earliest' ? a.time - b.time : b.time - a.time);
  return dates[0].value as string;
}

// ── SLUG HELPERS ────────────────────────────────────────────────────────
export function generateSlug(text: unknown, maxLength = 100): string {
  let t = asText(text).toLowerCase().trim();
  if (/[a-z]/.test(t)) {
    t = t.replace(/[^a-z0-9\s-]/g, ' ');
  } else {
    t = t.replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ');
  }
  return t
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, maxLength)
    .replace(/-+$/g, '');
}

export function hashString(input: unknown): string {
  let hash = 5381;
  const text = asText(input);
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash >>>= 0;
  }
  return hash.toString(36).substring(0, 8);
}

function normalizeText(text: unknown): string {
  return asText(text)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\p{L}\p{M}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRecruitmentTitle(title: unknown): string {
  return normalizeText(title)
    .replace(/\b\d+\s*(post|posts|vacancy|vacancies|seat|seats)\b/g, ' ')
    .replace(/\b(apply|online|form|forms|notification|short notice|notice|out|released|download|check|exam date|exam city|admit card|answer key|result|pre exam|mains exam|correction|edit|registration|otr|syllabus|for)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function uniqueValues(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  values.flatMap((v) => Array.isArray(v) ? v : [v]).forEach((v) => {
    const text = asText(v);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

// ── JOB GROUPING ────────────────────────────────────────────────────────
export interface JobGroup {
  key: string;
  jobs: Job[];
  primary: Job;
  slug: string;
  title: string;
  organization: string;
  posts: Job[];
  postCount: number;
  latestPosted: string;
  earliestStart: string;
  latestDeadline: string;
  states: string[];
  education: string[];
  educationFields: string[];
  categories: string[];
  applyLinks: string[];
  descriptions: string[];
  requirements: string[];
}

function getJobGroupKey(job: Job): string {
  const title = normalizeRecruitmentTitle(job.title || job.post_name || 'job');
  const org = normalizeText(job.organization || 'government');
  return title.split(' ').length < 4 ? `${title}|${org}` : title;
}

function getJobGroupSlug(job: Job): string {
  const titlePart = generateSlug(normalizeRecruitmentTitle(job.title || job.post_name), 80) || 'government-job';
  const key = getJobGroupKey(job);
  return `${titlePart}-${hashString(key)}`;
}

function splitPostNames(value: unknown): string[] {
  return asText(value)
    .split(/\r?\n|[•●▪]/)
    .map((item) => item.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean);
}

export function postNames(job: Job, fallback = 'listed post'): string[] {
  const names = splitPostNames(job.post_name);
  return names.length ? names : [asText(job.post_name || job.title, fallback)];
}

export function postNamesText(job: Job, fallback = 'listed post'): string {
  return postNames(job, fallback).join(', ');
}

export function postNamesHtml(job: Job, fallback?: string): string {
  const names = postNames(job, fallback);
  if (names.length === 1) return `<strong>${escapeHtml(names[0])}</strong>`;
  return `<strong>${names.length} posts</strong><ul class="compact-list">${names.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`;
}

function jobCompletenessScore(job: Job): number {
  return [
    job.post_name,
    job.education_required,
    job.education_fields,
    job.state,
    job.min_age,
    job.max_age,
    job.min_percentage,
    job.apply_link,
    job.description,
    job.additional_requirements
  ].reduce((score, v) => score + (asText(v) ? 1 : 0), 0) + stripHtml(job.description).length / 500;
}

function buildUniquePosts(jobs: Job[]): Job[] {
  const posts = new Map<string, Job>();
  jobs.forEach((job) => {
    const key = [
      normalizeText(job.post_name || job.title),
      normalizeText(job.education_required),
      normalizeText(job.state)
    ].join('|');
    const current = posts.get(key);
    if (!current || jobCompletenessScore(job) > jobCompletenessScore(current)) posts.set(key, job);
  });
  return [...posts.values()].sort((a, b) => asText(a.post_name || a.title).localeCompare(asText(b.post_name || b.title)));
}

export function groupJobs(allJobs: Job[]): JobGroup[] {
  const seenIds = new Set<string>();
  const groups = new Map<string, { key: string; jobs: Job[] }>();

  allJobs.forEach((job) => {
    if (!job || !job.id || !job.title) return;
    if (seenIds.has(job.id)) return;
    seenIds.add(job.id);

    const key = getJobGroupKey(job);
    if (!groups.has(key)) {
      groups.set(key, { key, jobs: [] });
    }
    groups.get(key)!.jobs.push(job);
  });

  return [...groups.values()].map((group) => {
    group.jobs.sort((a, b) => new Date(b.posted_date || 0).getTime() - new Date(a.posted_date || 0).getTime());
    const primary = group.jobs[0];
    const posts = buildUniquePosts(group.jobs);
    return {
      key: group.key,
      jobs: group.jobs,
      primary,
      slug: getJobGroupSlug(primary),
      title: asText(primary.title, 'Government Job Notification'),
      organization: asText(primary.organization, 'Government Organization'),
      posts,
      postCount: posts.reduce((total, job) => total + postNames(job).length, 0),
      latestPosted: firstValidDate(group.jobs.map((j) => j.posted_date), 'latest'),
      earliestStart: firstValidDate(group.jobs.map((j) => j.application_start_date), 'earliest'),
      latestDeadline: firstValidDate(group.jobs.map((j) => j.application_deadline), 'latest'),
      states: uniqueValues(group.jobs.map((j) => j.state)),
      education: uniqueValues(group.jobs.map((j) => j.education_required)),
      educationFields: uniqueValues(group.jobs.flatMap((j) => j.education_fields || [])),
      categories: uniqueValues(group.jobs.flatMap((j) => j.categories || [])),
      applyLinks: uniqueValues(group.jobs.map((j) => j.apply_link)).filter((link) => /^https?:\/\//i.test(link)),
      descriptions: uniqueValues(group.jobs.map((j) => stripHtml(j.description))).filter((t) => t.length > 40),
      requirements: uniqueValues(group.jobs.map((j) => stripHtml(j.additional_requirements))).filter((t) => t.length > 10),
    };
  }).sort((a, b) => new Date(b.latestPosted || 0).getTime() - new Date(a.latestPosted || 0).getTime());
}

export function jobDescription(group: JobGroup): string {
  const primaryDescription = group.descriptions[0];
  if (primaryDescription) return primaryDescription;
  const postsText = group.posts.slice(0, 6).map((job) => postNamesText(job, 'listed post')).join(', ');
  const education = group.education.length ? group.education.join(', ') : 'the required qualification';
  const locations = group.states.length ? group.states.join(', ') : 'India';
  const requirements = group.requirements.length ? ` Additional requirements noted in GovFitAI data include ${group.requirements.slice(0, 4).join('; ')}.` : '';
  return `${group.organization} has published ${group.title}. This consolidated page covers ${group.postCount} post option${group.postCount === 1 ? '' : 's'} including ${postsText}. Candidates can review eligibility, age limit, education requirement, important dates, official links, and preparation resources for ${locations}. Applicants should verify the final details in the official notification before applying. Required education includes ${education}.${requirements}`;
}

export function jobEducationSummary(job: Job): string {
  const parts = uniqueValues([
    job.education_required,
    ...(Array.isArray(job.education_fields) ? job.education_fields : [])
  ]);
  return parts.join(', ') || 'See notification';
}

export function jobRequirementSummary(job: Job): string {
  return stripHtml(job.additional_requirements) || 'As per official notification';
}

// ── JOB JSON-LD ─────────────────────────────────────────────────────────
export function jobJsonLd(group: JobGroup): object {
  return {
    '@context': 'https://schema.org',
    '@graph': group.posts.slice(0, 40).map((job) => ({
      '@type': 'JobPosting',
      title: postNamesText(job, group.title),
      description: stripHtml(job.description) || jobDescription(group),
      datePosted: isoDate(job.posted_date || group.latestPosted),
      validThrough: isoDate(group.latestDeadline) ? `${isoDate(group.latestDeadline)}T23:59:00+05:30` : undefined,
      employmentType: 'FULL_TIME',
      hiringOrganization: {
        '@type': 'Organization',
        name: asText(job.organization || group.organization)
      },
      jobLocation: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          addressRegion: asText(job.state, 'India'),
          addressCountry: 'IN'
        }
      },
      educationRequirements: jobEducationSummary(job),
      qualifications: jobRequirementSummary(job),
      url: `${SITE_URL}/jobs/${group.slug}/`
    }))
  };
}

// ── QUIZ HELPERS ────────────────────────────────────────────────────────
export interface QuizGroup {
  category: string;
  slug: string;
  questions: QuizQuestion[];
}

export function getQuestionText(question: QuizQuestion): string {
  return cleanQuestionText(question.question_en || question.question_hi);
}

export function getQuestionOptions(question: QuizQuestion): string[] {
  const en = Array.isArray(question.options_en) ? question.options_en.filter((o) => asText(o)) : [];
  const hi = Array.isArray(question.options_hi) ? question.options_hi.filter((o) => asText(o)) : [];
  return en.length ? en : hi;
}

export function getCorrectIndex(question: QuizQuestion): number {
  const index = Number(question.correct_option || 1) - 1;
  return Math.max(0, index);
}

export function getQuizCategorySlug(category: string): string {
  return generateSlug(category || 'general-knowledge', 80) || 'general-knowledge';
}

export function groupMcqs(allMcqs: QuizQuestion[]): QuizGroup[] {
  const seen = new Set<string>();
  const groups = new Map<string, QuizQuestion[]>();

  allMcqs.forEach((question) => {
    const text = getQuestionText(question);
    if (!text) return;
    const key = normalizeText(text);
    if (seen.has(key)) return;
    seen.add(key);

    const category = asText(question.category, 'General Knowledge');
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(question);
  });

  return [...groups.entries()]
    .map(([category, questions]) => ({
      category,
      slug: getQuizCategorySlug(category),
      questions,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function quizJsonLd(category: string, questions: QuizQuestion[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Quiz',
    name: `${category} MCQ Practice`,
    about: { '@type': 'Thing', name: category },
    hasPart: questions.slice(0, 100).map((question) => {
      const qText = getQuestionText(question);
      const options = getQuestionOptions(question);
      const correct = options[getCorrectIndex(question)] || '';
      return {
        '@type': 'Question',
        eduQuestionType: 'Flashcard',
        text: qText,
        acceptedAnswer: {
          '@type': 'Answer',
          text: correct
        }
      };
    })
  };
}

// ── GENERAL ─────────────────────────────────────────────────────────────
export function questionAnchor(question: QuizQuestion): string {
  return `question-${generateSlug(question.id || question.question_en || question.question_hi, 32) || hashString(question.question_en || question.question_hi)}`;
}

/**
 * Clean JSON-LD data, removing null/undefined/empty values.
 */
export function cleanJsonLd(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanJsonLd).filter((item) => item !== undefined);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      const cleaned = cleanJsonLd(item);
      if (cleaned !== undefined && cleaned !== '' && !(Array.isArray(cleaned) && cleaned.length === 0)) {
        out[key] = cleaned;
      }
    });
    return out;
  }
  return value === undefined || value === null ? undefined : value;
}
