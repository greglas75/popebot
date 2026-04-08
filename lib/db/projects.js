import { randomUUID } from 'crypto';
import { eq, desc, and } from 'drizzle-orm';
import { getDb } from './index.js';
import { projects } from './schema.js';

/**
 * Find an existing project by userId+repo, or create one if it doesn't exist.
 * Title defaults to the repo name after "/" (e.g. "my-app" from "owner/my-app").
 * @param {string} userId
 * @param {string} repo - Full repo name (e.g. "owner/my-app")
 * @returns {object} The existing or newly created project
 */
export function ensureProject(userId, repo) {
  const db = getDb();
  const existing = db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.repo, repo)))
    .get();
  if (existing) return existing;

  const now = Date.now();
  const project = {
    id: randomUUID(),
    userId,
    repo,
    title: repo.split('/').pop() || repo,
    defaultBranch: 'main',
    archived: 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(projects).values(project).run();
  return project;
}

/**
 * Get a single project by ID.
 * @param {string} id
 * @returns {object|undefined}
 */
export function getProjectById(id) {
  const db = getDb();
  return db.select().from(projects).where(eq(projects.id, id)).get();
}

/**
 * Get all projects for a user, sorted by updatedAt desc.
 * @param {string} userId
 * @param {boolean} [includeArchived=false] - If true, include archived projects
 * @returns {object[]}
 */
export function getProjectsByUser(userId, includeArchived = false) {
  const db = getDb();
  const conditions = [eq(projects.userId, userId)];
  if (!includeArchived) {
    conditions.push(eq(projects.archived, 0));
  }
  return db
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.updatedAt))
    .all();
}

/**
 * Archive a project (set archived=1).
 * @param {string} projectId
 */
export function archiveProject(projectId) {
  const db = getDb();
  db.update(projects)
    .set({ archived: 1, updatedAt: Date.now() })
    .where(eq(projects.id, projectId))
    .run();
}

/**
 * Unarchive a project (set archived=0).
 * @param {string} projectId
 */
export function unarchiveProject(projectId) {
  const db = getDb();
  db.update(projects)
    .set({ archived: 0, updatedAt: Date.now() })
    .where(eq(projects.id, projectId))
    .run();
}
