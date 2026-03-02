# 🎓 Academia ERP System

A professional, full-stack ERP system for college course management — built with Node.js, Express, MongoDB Atlas, and vanilla HTML/CSS/JS.

---

## 🏗️ Architecture

```
academia-erp/
├── server.js              # Main Express server
├── models/
│   └── index.js           # All Mongoose models (User, Classroom, Assignment, Submission, Notification)
├── middleware/
│   └── auth.js            # JWT authentication middleware
├── routes/
│   ├── auth.js            # Login, register, profile
│   ├── classrooms.js      # Classroom CRUD, join via code
│   ├── assignments.js     # Assignments, submissions, grading
│   ├── admin.js           # Admin-only routes + analytics
│   └── notifications.js   # Notification system
├── public/
│   └── index.html         # Complete frontend (single HTML file)
├── .env.example           # Environment variable template
├── render.yaml            # Render.com deployment config
└── package.json
```

---

## 🚀 Quick Start (Local Development)

### Step 1: Set Up MongoDB Atlas

1. Go to [https://cloud.mongodb.com](https://cloud.mongodb.com) and create a free account
2. Create a new cluster (choose **M0 Free Tier**)
3. Under **Security → Database Access**, create a database user with a password
4. Under **Security → Network Access**, add `0.0.0.0/0` (allow all IPs)
5. Click **Connect → Connect your application**, copy the connection string
6. Replace `<password>` with your database user's password

### Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
```
MONGODB_URI=mongodb+srv://your_username:your_password@cluster.mongodb.net/academia_erp
JWT_SECRET=your_very_long_random_secret_key_here
FRONTEND_URL=http://localhost:5500
ADMIN_EMAIL=admin@your-college.edu
ADMIN_PASSWORD=YourSecurePassword123
```

### Step 3: Install & Run Backend

```bash
npm install
npm start          # Production
npm run dev        # Development (auto-restart on changes)
```

The server runs at `http://localhost:5000`.

### Step 4: Open Frontend

Open `public/index.html` directly in your browser, or use a simple server:
```bash
npx serve public   # Opens at http://localhost:3000
```

**Important:** In `public/index.html`, line 1 of the `<script>` section, update:
```javascript
const API_BASE = 'http://localhost:5000';
```

---

## 🌐 Deploying to Production (Netlify + Render)

### Backend → Render.com (Free)

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Set these environment variables in the Render dashboard:
   - `MONGODB_URI` → Your Atlas connection string
   - `JWT_SECRET` → Strong random string
   - `FRONTEND_URL` → Your Netlify URL (e.g. `https://my-academia.netlify.app`)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` → Admin credentials
5. Deploy. Note the URL (e.g. `https://academia-erp-api.onrender.com`)

### Frontend → Netlify

1. In `public/index.html`, update the API_BASE:
   ```javascript
   const API_BASE = 'https://academia-erp-api.onrender.com'; // Your Render URL
   ```
2. Go to [app.netlify.com](https://app.netlify.com) → New site
3. Drag & drop the `public/` folder (or connect GitHub)
4. Your site is live at a Netlify URL

---

## 👥 User Roles

### 🔴 Admin
- Auto-created on first server start (credentials from `.env`)
- Access to ALL classrooms, students, assignments, submissions
- Toggle user accounts active/inactive
- Analytics per classroom (submission rates, avg marks, student performance)
- Full submission history dashboard

### 👨‍🏫 Professor
- Create, edit, delete classrooms
- Each classroom gets a unique 6-char class code
- View enrolled students, remove students
- Create assignments with: deadline, total marks, allowed file types
- Deadline validation — must be in the future
- View all submissions for each assignment
- Grade submissions with marks and feedback
- Students notified when graded

### 👨‍🎓 Student
- Join classrooms via 6-character class code
- View all assignments in enrolled classrooms
- Submit assignments before deadline (up to 5 files, 10MB each)
- Multiple file extensions supported (PDF, Word, images, ZIP, code, etc.)
- View grades and professor feedback
- Average grade calculation per classroom
- Overall academic performance dashboard

---

## 📡 API Reference

```
POST   /api/auth/register           Register (professor/student)
POST   /api/auth/login              Login all roles
GET    /api/auth/me                 Get current user
PATCH  /api/auth/update-profile     Update profile
PATCH  /api/auth/change-password    Change password

GET    /api/classrooms              List classrooms (role-filtered)
POST   /api/classrooms              Create classroom (professor)
GET    /api/classrooms/:id          Get classroom detail
PATCH  /api/classrooms/:id          Update classroom (professor)
DELETE /api/classrooms/:id          Delete classroom
POST   /api/classrooms/join/with-code  Join via class code (student)
DELETE /api/classrooms/:id/remove-student/:sid  Remove student

GET    /api/assignments/classroom/:id     List assignments for classroom
GET    /api/assignments/:id               Get single assignment
POST   /api/assignments                   Create assignment (professor)
PATCH  /api/assignments/:id               Update assignment
DELETE /api/assignments/:id               Delete assignment
GET    /api/assignments/:id/submissions   Get all submissions (professor)
POST   /api/assignments/:id/submit        Submit assignment (student)
PATCH  /api/assignments/:id/grade/:subId  Grade submission
GET    /api/assignments/student/my-marks  Student's grade summary

GET    /api/admin/dashboard               Admin stats
GET    /api/admin/users                   All users
PATCH  /api/admin/users/:id/toggle        Toggle user active
GET    /api/admin/classrooms              All classrooms
GET    /api/admin/classrooms/:id/analytics  Classroom analytics
GET    /api/admin/submissions             All submissions

GET    /api/notifications             Get notifications
PATCH  /api/notifications/read-all    Mark all read
PATCH  /api/notifications/:id/read    Mark one read
```

---

## 🔒 Security Features

- JWT authentication (7-day tokens)
- bcrypt password hashing
- Rate limiting (200 req / 15 min per IP)
- Helmet.js security headers
- CORS restricted to configured frontend URL
- Role-based access control on all routes

---

## 📝 Notes

- Files are stored as base64 in MongoDB — for large-scale use, migrate to Cloudinary or AWS S3
- The admin account is seeded automatically on first startup
- Change admin credentials in `.env` before deploying
- Notifications poll every 60 seconds on the frontend
