CREATE TYPE role_enum AS ENUM ('STUDENT','TEACHER','ADMIN');
CREATE TYPE grade_letter AS ENUM ('A_PLUS','A','A_MINUS','B_PLUS','B','B_MINUS','C_PLUS','C','C_MINUS','D','F');

CREATE TABLE IF NOT EXISTS users (
    id           SERIAL PRIMARY KEY,
    role         role_enum NOT NULL,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL UNIQUE,
    password     TEXT NOT NULL,
    student_id   TEXT UNIQUE,
    major        TEXT,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
    id                SERIAL PRIMARY KEY,
    code              TEXT NOT NULL UNIQUE,
    name              TEXT NOT NULL,
    credits           INTEGER NOT NULL CHECK (credits >= 0),
    enrollment_limit  INTEGER NOT NULL CHECK (enrollment_limit >= 0),
    teacher_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_prereqs (
    id         SERIAL PRIMARY KEY,
    course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    prereq_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT course_prereqs_unique UNIQUE (course_id, prereq_id),
    CONSTRAINT course_prereqs_not_self CHECK (course_id <> prereq_id)
);

CREATE TABLE IF NOT EXISTS enrollments (
    id          SERIAL PRIMARY KEY,
    student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT enrollments_unique UNIQUE (student_id, course_id)
);

CREATE TABLE IF NOT EXISTS grades (
    id           SERIAL PRIMARY KEY,
    student_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id    INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    value        grade_letter NOT NULL,
    assigned_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_courses_teacher ON courses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course  ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_grades_student_course_time ON grades(student_id, course_id, assigned_at DESC);
