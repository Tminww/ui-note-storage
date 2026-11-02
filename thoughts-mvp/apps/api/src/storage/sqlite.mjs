import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const defaults = {
  generatorProvider: 'openrouter',
  generatorModel: 'deepseek/deepseek-v4.1-flash-1017',
  decisionProvider: 'openrouter',
  decisionModel: 'typesafe/jev-1.14',
  confidenceThreshold: 0.7
};

export function createSQLiteRepository(databasePath = './data/thoughts.sqlite') {
  if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#5C75E8', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS thoughts (
      id TEXT PRIMARY KEY, raw_text TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]',
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      project_locked INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'note', status TEXT NOT NULL DEFAULT 'pending',
      confidence REAL, error_message TEXT,
      generator_model TEXT, decision_model TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_thoughts_project ON thoughts(project_id);
    CREATE INDEX IF NOT EXISTS idx_thoughts_created ON thoughts(created_at DESC);
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1), generator_provider TEXT NOT NULL,
      generator_model TEXT NOT NULL, decision_provider TEXT NOT NULL,
      decision_model TEXT NOT NULL, confidence_threshold REAL NOT NULL
    );
  `);
  db.prepare(`INSERT OR IGNORE INTO settings (id,generator_provider,generator_model,decision_provider,decision_model,confidence_threshold) VALUES (1,?,?,?,?,?)`)
    .run(defaults.generatorProvider, defaults.generatorModel, defaults.decisionProvider, defaults.decisionModel, defaults.confidenceThreshold);

  const projectFromRow = (r) => r ? ({
    id: r.id, name: r.name, description: r.description, color: r.color,
    createdAt: r.created_at, updatedAt: r.updated_at, thoughtCount: r.thought_count ?? undefined
  }) : null;
  const thoughtFromRow = (r) => r ? ({
    id: r.id, rawText: r.raw_text, title: r.title, summary: r.summary,
    tags: JSON.parse(r.tags_json || '[]'), projectId: r.project_id,
    projectLocked: !!r.project_locked, category: r.category,
    status: r.status, confidence: r.confidence, errorMessage: r.error_message,
    generatorModel: r.generator_model, decisionModel: r.decision_model,
    createdAt: r.created_at, updatedAt: r.updated_at
  }) : null;
  const settingsFromRow = (r) => ({
    generatorProvider: r.generator_provider, generatorModel: r.generator_model,
    decisionProvider: r.decision_provider, decisionModel: r.decision_model,
    confidenceThreshold: r.confidence_threshold
  });
  const repository = {
    listProjects() {
      return db.prepare(`SELECT p.*, COUNT(t.id) AS thought_count FROM projects p LEFT JOIN thoughts t ON t.project_id=p.id GROUP BY p.id ORDER BY p.name COLLATE NOCASE`).all().map(projectFromRow);
    },
    getProject(id) { return projectFromRow(db.prepare('SELECT * FROM projects WHERE id=?').get(id)); },
    createProject({ name, description = '', color = '#5C75E8' }) {
      const id = randomUUID(), now = new Date().toISOString();
      db.prepare('INSERT INTO projects (id,name,description,color,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id,name,description,color,now,now);
      return repository.getProject(id);
    },
    updateProject(id, patch) {
      const prev = repository.getProject(id);
      if (!prev) return null;
      const next = { ...prev, ...patch };
      db.prepare('UPDATE projects SET name=?,description=?,color=?,updated_at=? WHERE id=?')
        .run(next.name,next.description,next.color,new Date().toISOString(),id);
      return repository.getProject(id);
    },
    deleteProject(id) {
      if (!repository.getProject(id)) return false;
      // Unlock notes when the user deletes their manually chosen project.
      db.prepare('UPDATE thoughts SET project_locked=0 WHERE project_id=?').run(id);
      return db.prepare('DELETE FROM projects WHERE id=?').run(id).changes > 0;
    },
    listThoughts({ q = '', projectId, status, category } = {}) {
      let sql = 'SELECT * FROM thoughts WHERE 1=1';
      const args = [];
      if (q) { sql += ' AND (raw_text LIKE ? OR title LIKE ? OR summary LIKE ? OR tags_json LIKE ?)'; args.push(...Array(4).fill(`%${q}%`)); }
      if (projectId === 'inbox') sql += ' AND project_id IS NULL';
      else if (projectId) { sql += ' AND project_id=?'; args.push(projectId); }
      if (status) { sql += ' AND status=?'; args.push(status); }
      if (category) { sql += ' AND category=?'; args.push(category); }
      sql += ' ORDER BY created_at DESC LIMIT 500';
      return db.prepare(sql).all(...args).map(thoughtFromRow);
    },
    getThought(id) { return thoughtFromRow(db.prepare('SELECT * FROM thoughts WHERE id=?').get(id)); },
    createThought({ rawText, projectId = null }) {
      const id = randomUUID(), now = new Date().toISOString();
      db.prepare(`INSERT INTO thoughts (id,raw_text,title,project_id,project_locked,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
        .run(id,rawText,rawText.slice(0,90),projectId,projectId ? 1 : 0,now,now);
      return repository.getThought(id);
    },
    updateThought(id, patch) {
      const prev = repository.getThought(id);
      if (!prev) return null;
      const next = { ...prev, ...patch };
      db.prepare(`UPDATE thoughts SET raw_text=?,title=?,summary=?,tags_json=?,project_id=?,project_locked=?,category=?,status=?,confidence=?,error_message=?,generator_model=?,decision_model=?,updated_at=? WHERE id=?`)
        .run(next.rawText,next.title,next.summary,JSON.stringify(next.tags),next.projectId,next.projectLocked ? 1 : 0,
          next.category,next.status,next.confidence,next.errorMessage,next.generatorModel,next.decisionModel,new Date().toISOString(),id);
      return repository.getThought(id);
    },
    deleteThought(id) { return db.prepare('DELETE FROM thoughts WHERE id=?').run(id).changes > 0; },
    exportSnapshot() {
      return {
        format: 'thoughts-mvp-v1', exportedAt: new Date().toISOString(),
        projects: repository.listProjects(),
        thoughts: db.prepare('SELECT * FROM thoughts ORDER BY created_at DESC').all().map(thoughtFromRow),
        settings: repository.getSettings()
      };
    },
    getSettings() { return settingsFromRow(db.prepare('SELECT * FROM settings WHERE id=1').get()); },
    updateSettings(patch) {
      const next = { ...repository.getSettings(), ...patch };
      db.prepare(`UPDATE settings SET generator_provider=?,generator_model=?,decision_provider=?,decision_model=?,confidence_threshold=? WHERE id=1`)
        .run(next.generatorProvider,next.generatorModel,next.decisionProvider,next.decisionModel,next.confidenceThreshold);
      return repository.getSettings();
    },
    close() { db.close(); }
  };
  return repository;
}
