// models/index.js - All Mongoose Models

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ─────────────────────────────────────────
// USER MODEL (Professor / Student / Admin)
// ─────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, enum: ['admin', 'professor', 'student'], required: true },
  avatar: { type: String, default: null }, // initials-based avatar color
  studentId: { type: String, default: null }, // for students
  department: { type: String, default: null },
  enrolledClassrooms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Classroom' }], // for students
  createdAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date, default: null }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

const User = mongoose.model('User', userSchema);

// ─────────────────────────────────────────
// CLASSROOM MODEL
// ─────────────────────────────────────────
const classroomSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  classCode: { type: String, required: true, unique: true, uppercase: true },
  professor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  semester: { type: String, default: '' },
  academicYear: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  coverColor: { type: String, default: '#4F46E5' },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Classroom = mongoose.model('Classroom', classroomSchema);

// ─────────────────────────────────────────
// ASSIGNMENT MODEL
// ─────────────────────────────────────────
const assignmentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
  professor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deadline: { type: Date, required: true },
  totalMarks: { type: Number, required: true, min: 1, max: 1000 },
  allowedExtensions: { type: [String], default: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'zip', 'txt', 'ppt', 'pptx', 'xls', 'xlsx'] },
  attachments: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    url: String, // base64 or URL
    uploadedAt: { type: Date, default: Date.now }
  }],
  isPublished: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Assignment = mongoose.model('Assignment', assignmentSchema);

// ─────────────────────────────────────────
// SUBMISSION MODEL
// ─────────────────────────────────────────
const submissionSchema = new mongoose.Schema({
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
  files: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    data: String, // base64 encoded file
    uploadedAt: { type: Date, default: Date.now }
  }],
  notes: { type: String, default: '' },
  submittedAt: { type: Date, default: Date.now },
  isLate: { type: Boolean, default: false },
  marksObtained: { type: Number, default: null },
  feedback: { type: String, default: '' },
  gradedAt: { type: Date, default: null },
  gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['submitted', 'graded', 'returned'], default: 'submitted' }
}, { timestamps: true });

submissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

const Submission = mongoose.model('Submission', submissionSchema);

// ─────────────────────────────────────────
// NOTIFICATION MODEL
// ─────────────────────────────────────────
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['assignment', 'grade', 'classroom', 'system'], default: 'system' },
  isRead: { type: Boolean, default: false },
  relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = { User, Classroom, Assignment, Submission, Notification };
