INSERT INTO users (role,name,email,password) VALUES
('ADMIN','Admin User','admin@coursehub.io','$2b$10$J5V2b3nB1Szi6x1dDko3ZeH5k8g0j0yKp8L3i9Xf8mVtY2E3kqJ4a') -- "adminpass"
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (role,name,email,password) VALUES
('TEACHER','Daaimah Teacher','daaimah@coursehub.io','$2b$10$J5V2b3nB1Szi6x1dDko3ZeH5k8g0j0yKp8L3i9Xf8mVtY2E3kqJ4a')
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (role,name,email,password,student_id,major) VALUES
('STUDENT','Regina Student','regina@coursehub.io','$2b$10$J5V2b3nB1Szi6x1dDko3ZeH5k8g0j0yKp8L3i9Xf8mVtY2E3kqJ4a','S1001','CS'),
('STUDENT','Gloria Student','gloria@coursehub.io','$2b$10$J5V2b3nB1Szi6x1dDko3ZeH5k8g0j0yKp8L3i9Xf8mVtY2E3kqJ4a','S1002','Math')
ON CONFLICT (email) DO NOTHING;

INSERT INTO courses (code,name,credits,enrollment_limit,teacher_id)
SELECT 'CS101','Intro to CS',3,30,u.id FROM users u WHERE u.email='daaimah@coursehub.io'
ON CONFLICT (code) DO NOTHING;

INSERT INTO courses (code,name,credits,enrollment_limit,teacher_id)
SELECT 'CS201','Data Structures',3,25,u.id FROM users u WHERE u.email='daaimah@coursehub.io'
ON CONFLICT (code) DO NOTHING;

-- CS201 requires CS101
INSERT INTO course_prereqs (course_id, prereq_id)
SELECT c2.id, c1.id
FROM courses c1, courses c2
WHERE c1.code='CS101' AND c2.code='CS201'
ON CONFLICT (course_id,prereq_id) DO NOTHING;

-- Enroll Regina in CS101 and give her A
INSERT INTO enrollments (student_id, course_id)
SELECT s.id, c.id FROM users s, courses c
WHERE s.email='regina@coursehub.io' AND c.code='CS101'
ON CONFLICT DO NOTHING;

INSERT INTO grades (student_id, course_id, value)
SELECT s.id, c.id, 'A'::grade_letter FROM users s, courses c
WHERE s.email='regina@coursehub.io' AND c.code='CS101';
