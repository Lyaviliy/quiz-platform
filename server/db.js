const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'quiz.db')
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('organizer', 'participant')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    time_per_question INTEGER NOT NULL DEFAULT 20,
    speed_bonus INTEGER NOT NULL DEFAULT 1,
    shuffle_questions INTEGER NOT NULL DEFAULT 0,
    shuffle_options INTEGER NOT NULL DEFAULT 0,
    auto_advance INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    image TEXT,
    type TEXT NOT NULL CHECK (type IN ('single', 'multiple')),
    time_limit INTEGER,
    points INTEGER NOT NULL DEFAULT 100
  );

  CREATE TABLE IF NOT EXISTS options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    is_correct INTEGER NOT NULL DEFAULT 0
  );

  -- Проведённая игра. snapshot хранит копию вопросов на момент запуска:
  -- историю и результаты не ломает ни правка, ни удаление исходного квиза.
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER REFERENCES quizzes(id) ON DELETE SET NULL,
    host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    quiz_title TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'active', 'finished', 'aborted')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    finished_at TEXT
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    token TEXT NOT NULL,
    nickname TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    total_time_ms INTEGER NOT NULL DEFAULT 0,
    place INTEGER,
    joined_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    question_index INTEGER NOT NULL,
    selected TEXT NOT NULL,
    is_correct INTEGER NOT NULL,
    points INTEGER NOT NULL,
    time_ms INTEGER NOT NULL,
    UNIQUE (player_id, question_index)
  );

  CREATE INDEX IF NOT EXISTS idx_quizzes_owner ON quizzes(owner_id);
  CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);
  CREATE INDEX IF NOT EXISTS idx_options_question ON options(question_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_host ON sessions(host_id);
  CREATE INDEX IF NOT EXISTS idx_players_session ON players(session_id);
  CREATE INDEX IF NOT EXISTS idx_players_user ON players(user_id);
  CREATE INDEX IF NOT EXISTS idx_answers_session ON answers(session_id);
`)

const CATEGORIES = [
  'Общие знания', 'Наука и технологии', 'История', 'География', 'Кино и сериалы',
  'Музыка', 'Спорт', 'IT и программирование', 'Литература', 'Корпоративный', 'Другое',
]
const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)')
for (const name of CATEGORIES) insertCategory.run(name)

// Живые комнаты держатся в памяти процесса. Если сервер перезапустился,
// незавершённые игры продолжить нельзя — честно помечаем их прерванными.
db.prepare(
  `UPDATE sessions SET status = 'aborted', finished_at = datetime('now')
   WHERE status IN ('lobby', 'active')`
).run()

module.exports = db
