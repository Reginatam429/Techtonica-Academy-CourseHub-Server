# 🏫 Techtonica-Academy-CourseHub-Server

Techtonica CourseHub is a full-stack web application designed to help students **browse and enroll in courses**, while **teachers and admins can manage courses and assign grades**. It features secure authentication, role-based access control, and prerequisite checks for course enrollment.

This project is built with the **Node.js + Express** backend and a **PostgreSQL** database, deployed on Heroku.

> 💻 Frontend repo: https://github.com/Reginatam429/Techtonica-Academy-CourseHub

> 🌐 Heroku Deployment: https://techtonica-coursehub-api-1dcb105ae03b.herokuapp.com


---

## 🧰 Tech Stack

- **Backend**: Node.js, Express  
- **Database**: PostgreSQL (Heroku Postgres)  
- **Authentication**: JWT (JSON Web Token)  
- **Deployment**: Heroku  
- **Dev Tools**: Curl, Postman, bcrypt, pg

---

## ⚙️ Local Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/Reginatam429/Techtonica-Academy-CourseHub-Server.git
cd Techtonica-Academy-CourseHub-Server
````

### 2. Install Dependencies and Run

```bash
npm install
npm start  
```
Optional dev script (if you add nodemon): npm run dev

📦 Dependencies & Why They’re Here

Runtime

 - express – HTTP server & routing

 - pg – PostgreSQL client

 - bcrypt – secure password hashing

 - jsonwebtoken – JWT-based auth

 - cors – CORS headers for frontend → backend calls

 - dotenv – load environment variables from .env

 - helmet – secure HTTP headers

 - morgan – request logging

Dev/Test

 - jest – test runner

 - supertest – HTTP assertions against the Express app

### 3. Set Up Environment Variables

Create a `.env` file in the project root:

```bash
touch .env
```

Example:

```
PORT=3000
DATABASE_URL=postgres://localhost:5432/techtonica_coursehub
JWT_SECRET=your_jwt_secret_here
CLIENT_URL=http://localhost:5173
```

### 4. 🗄️ Database Set up

Schema & Seed (source of truth)

 - db/schema.sql – types, tables, indexes

 - db/seed.sql – initial users (Admin/Teacher/Students), demo courses, one prerequisite, enrollments, sample grades

Apply locally:
```
psql techtonica_coursehub < db/schema.sql
psql techtonica_coursehub < db/seed.sql
```
### 5. Run the Server

```bash
npm start
```

Server runs at [http://localhost:3000](http://localhost:3000)

---

## 🌐 Production Deployment

The backend is deployed on Heroku:

```
https://techtonica-coursehub-api-1dcb105ae03b.herokuapp.com
```

---

## 📦 API Routes

Auth

 - POST /auth/register – Student signup (auto email + studentId)

 - POST /auth/login – Login, receive JWT

Users

 - POST /users (ADMIN) – Create user (Student/Teacher/Admin)

 - GET /users?query= (ADMIN) – Search all users by name/email/major/id

 - GET /users?query= (TEACHER) – Search students only

 - GET /users/:id (ADMIN) – Read user by id

 - PUT /users/:id (ADMIN) – Update user (role, name, email, major, password, studentId)

 - DELETE /users/:id (ADMIN) – Delete user

Courses

 - GET /courses – Public list, includes available_seats

 - POST /courses (TEACHER/ADMIN) – Create course (owner=teacher)

 - PUT /courses/:id (Owner TEACHER/ADMIN) – Update

 - DELETE /courses/:id (Owner TEACHER/ADMIN) – Delete

 - GET /courses/:id/prereqs – List prereqs

 - POST /courses/:id/prereqs (Owner TEACHER/ADMIN) – Add prereq ({ prereqId })

 - DELETE /courses/:id/prereqs/:prereqId (Owner TEACHER/ADMIN) – Remove prereq

Enrollments

 - POST /enrollments (STUDENT) – Enroll { courseId }

 - Checks capacity, prereqs (latest grade must not be F)

 - GET /enrollments/me (STUDENT) – My enrollments

 - DELETE /enrollments/:enrollmentId (STUDENT) – Unenroll by enrollment id

 - DELETE /enrollments/by-course/:courseId (STUDENT) – Unenroll by course id

 - GET /enrollments/course/:courseId (Owner TEACHER/ADMIN) – Course roster

Grades

 - POST /grades (Owner TEACHER/ADMIN) – Assign grade { studentId, courseId, value }
(A+…F, keeps history)

 - GET /grades/me (STUDENT) – My grade history

 - GET /grades/me/gpa (STUDENT) – My GPA

 - GET /grades/student/:studentId/gpa (Owner TEACHER/ADMIN) – A student’s GPA (teacher: only their students; admin: any)

---

### 🔑 Authentication

#### `POST /auth/login`

Log in with email and password.

 - Registration (student self-signup): POST /auth/register

   - Auto-generates a unique academy email like first.last@coursehub.io, first.last2@... if needed

   - Auto-generates a unique studentId (S####) if not provided

 - Role-based access (RBAC): STUDENT, TEACHER, ADMIN

   - Admin: manage users, view all users

   - Teacher: manage their own courses, view rosters, grade their students

   - Student: enroll/unenroll, view their enrollments and grades

JWT is expected in requests as:
```
Authorization: Bearer <token>
Content-Type: application/json
```
---


## 🧪 Testing

Run:
```
npm test
```

basic.tests.js:

1. GET / returns 200 – Verifies server is up

2. POST /auth/login fails with bad creds – Ensures proper 401 handling

3. POST /auth/login succeeds for seeded admin – Confirms bcrypt + JWT flow

These use Jest + Supertest against the Express app (app export), no need to run the server separately.

---

## 🧭 Future Improvements

* ✅ Add password reset functionality
* 📅 Add course scheduling & sections
* 🧑‍🎓 Student transcripts 
* 🛡️ Input validation and improved error handling
* 🧪 More test coverage (prereq & capacity checks)
