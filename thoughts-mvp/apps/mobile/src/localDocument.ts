import * as SQLite from 'expo-sqlite'
import { LocalConflictError, type DocumentStorage } from './localCore'

const database = SQLite.openDatabaseAsync('thoughts-local.db').then(async (db) => {
    await db.execAsync(
        'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS local_state (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL);'
    )
    return db
})
// A single SQLite statement atomically commits the snapshot and its durable outbox revisions.
let previous: string | null = null
export const localDocument: DocumentStorage = {
    load: async () => {
        previous =
            (
                await (
                    await database
                ).getFirstAsync<{ value: string }>('SELECT value FROM local_state WHERE id = 1')
            )?.value ?? null
        return previous
    },
    save: async (value) => {
        const db = await database
        const result =
            previous === null
                ? await db.runAsync(
                      'INSERT OR IGNORE INTO local_state (id,value) VALUES (1,?)',
                      value
                  )
                : await db.runAsync(
                      'UPDATE local_state SET value=? WHERE id=1 AND value=?',
                      value,
                      previous
                  )
        if (!result.changes) throw new LocalConflictError('Локальная база обновилась в фоне')
        previous = value
    }
}
