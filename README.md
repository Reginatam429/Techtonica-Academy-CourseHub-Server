# 🏫 Techtonica-Academy-CourseHub-Server

Techtonica CourseHub is a full-stack web application designed to help students **browse and enroll in courses**, while **teachers and admins can manage courses and assign grades**. It features secure authentication, role-based access control, and prerequisite checks for course enrollment.

This project is built with the **Node.js + Express** backend and a **PostgreSQL** database, deployed on Heroku.

> 💻 Frontend will be set up in a separate repo.

---

## 🚀 MVP Features

- 🔐 **JWT-based authentication** for Admin, Teacher, and Student roles  
- 🧑‍🏫 Admin & Teacher can create and manage courses  
- 🧑‍🎓 Students can self-enroll and unenroll in courses  
- 📜 Teachers can assign and view grades for their courses  
- 📈 Prerequisite enforcement for enrollment (must have passed required courses)  
- 🗃️ Database seeded with sample users and courses  
- ☁️ Deployed to Heroku with a managed Postgres DB

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

### 2. Install Dependencies

```bash
npm install
```

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

### 4. Initialize Database

```bash
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

> All routes require `Content-Type: application/json`.
> Authenticated routes also require:
>
> ```
> Authorization: Bearer <token>
> ```

---

### 🔑 Authentication

#### `POST /auth/login`

Log in with email and password.

**Body**

```json
{
  "email": "testteacher@coursehub.io",
  "password": "pass123"
}
```

**Response**

```json
{
  "token": "jwt-token",
  "user": {
    "id": 9,
    "role": "TEACHER",
    "name": "Test Teacher",
    "email": "testteacher@coursehub.io"
  }
}
```

---

### 🧑 User Management (Admin only)

#### `POST /users` – Create a user

#### `GET /users?query=<search>` – Search users

#### `PUT /users/:id` – Update user info

#### `DELETE /users/:id` – Delete user

**Example Body**

```json
{
  "role": "TEACHER",
  "name": "New Teacher",
  "email": "teacher@coursehub.io",
  "password": "pass123"
}
```

---

### 📚 Courses

#### `GET /courses` – List all courses (public)

#### `POST /courses` – Create a course (Teacher/Admin only)

```json
{
  "code": "CS301",
  "name": "Algorithms",
  "credits": 3,
  "enrollment_limit": 25
}
```

---

### 📝 Enrollments

#### `POST /enrollments` – Student enrolls in a course

```json
{
  "courseId": 2
}
```

#### `GET /enrollments/me` – List courses student is enrolled in

#### `DELETE /enrollments/:enrollmentId` – Unenroll by enrollment ID

#### `DELETE /enrollments/by-course/:courseId` – Unenroll by course ID

#### `GET /enrollments/course/:courseId` – Teacher views roster for their course

---

### 🏆 Grades

#### `POST /grades` – Teacher/Admin assigns grade

```json
{
  "studentId": 3,
  "courseId": 2,
  "value": "A"
}
```

#### `GET /grades/me` – Student views their grades

---

## 🧪 Testing

You can use `curl` or Postman for testing endpoints.

Example:

```bash
curl -X POST https://techtonica-coursehub-api-1dcb105ae03b.herokuapp.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"testteacher@coursehub.io","password":"adminpass"}'
```

---

## 🧭 Future Improvements

* ✅ Add password reset functionality
* 📅 Add course scheduling & sections
* 🧑‍🎓 Student transcripts and GPA calculation
* 🛡️ Input validation and improved error handling
