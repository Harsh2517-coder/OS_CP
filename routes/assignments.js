// routes/assignments.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Assignment, Classroom, Submission, Notification, User } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');

// Use memory storage (files stored as base64 in MongoDB)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (req, file, cb) => cb(null, true)
});


// SPECIFIC ROUTES FIRST (before /:id to avoid param conflicts)



// CLASSROOM ROUTE
// GET /api/assignments/classroom/:classroomId
router.get('/classroom/:classroomId', protect, async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.classroomId);
    if (!classroom || !classroom.isActive) return res.status(404).json({ success: false, message: 'Classroom not found.' });

    // Access check
    if (req.user.role === 'professor' && classroom.professor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (req.user.role === 'student' && !classroom.students.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not enrolled.' });
    }

    const assignments = await Assignment.find({ classroom: req.params.classroomId, isPublished: true })
      .populate('professor', 'name')
      .sort('-createdAt');

    // For students, add submission status
    let result = assignments;
    if (req.user.role === 'student') {
      result = await Promise.all(assignments.map(async (a) => {
        const sub = await Submission.findOne({ assignment: a._id, student: req.user._id });
        return { ...a.toObject(), submission: sub ? { status: sub.status, marksObtained: sub.marksObtained, submittedAt: sub.submittedAt } : null };
      }));
    }

    res.json({ success: true, assignments: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/assignments/:id
// GET /api/assignments/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).populate('professor', 'name email');
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });

    let submission = null;
    if (req.user.role === 'student') {
      submission = await Submission.findOne({ assignment: req.params.id, student: req.user._id });
    }

    res.json({ success: true, assignment, submission });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/assignments - Create assignment (professor)
router.post('/', protect, restrictTo('professor'), async (req, res) => {
  try {
    const { title, description, classroomId, deadline, totalMarks, allowedExtensions } = req.body;
    if (!title || !description || !classroomId || !deadline || !totalMarks) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const deadlineDate = new Date(deadline);
    if (deadlineDate <= new Date()) {
      return res.status(400).json({ success: false, message: 'Deadline must be a future date and time.' });
    }

    const classroom = await Classroom.findOne({ _id: classroomId, professor: req.user._id });
    if (!classroom) return res.status(404).json({ success: false, message: 'Classroom not found.' });

    const assignment = await Assignment.create({
      title, description,
      classroom: classroomId,
      professor: req.user._id,
      deadline: deadlineDate,
      totalMarks: Number(totalMarks),
      allowedExtensions: allowedExtensions || ['pdf', 'doc', 'docx', 'jpg', 'png', 'zip', 'txt', 'ppt', 'pptx']
    });

    // Notify all students
    const studentNotifs = classroom.students.map(studentId => ({
      user: studentId,
      title: 'New Assignment Posted',
      message: `"${title}" has been posted in ${classroom.name}. Deadline: ${deadlineDate.toLocaleDateString()}.`,
      type: 'assignment',
      relatedId: assignment._id
    }));
    if (studentNotifs.length > 0) await Notification.insertMany(studentNotifs);

    res.status(201).json({ success: true, assignment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/assignments/:id - Update assignment
router.patch('/:id', protect, restrictTo('professor'), async (req, res) => {
  try {
    const assignment = await Assignment.findOne({ _id: req.params.id, professor: req.user._id });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });

    const { title, description, deadline, totalMarks, allowedExtensions } = req.body;
    if (deadline) {
      const deadlineDate = new Date(deadline);
      if (deadlineDate <= new Date()) return res.status(400).json({ success: false, message: 'Deadline must be in the future.' });
      assignment.deadline = deadlineDate;
    }
    if (title) assignment.title = title;
    if (description) assignment.description = description;
    if (totalMarks) assignment.totalMarks = Number(totalMarks);
    if (allowedExtensions) assignment.allowedExtensions = allowedExtensions;
    await assignment.save();
    res.json({ success: true, assignment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/assignments/:id
router.delete('/:id', protect, restrictTo('professor', 'admin'), async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, professor: req.user._id };
    const assignment = await Assignment.findOneAndDelete(query);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    await Submission.deleteMany({ assignment: req.params.id });
    res.json({ success: true, message: 'Assignment deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/assignments/:id/submissions - Get all submissions (professor/admin)
router.get('/:id/submissions', protect, restrictTo('professor', 'admin'), async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });

    const classroom = await Classroom.findById(assignment.classroom)
      .populate('students', 'name email studentId');

    const submissions = await Submission.find({ assignment: req.params.id })
      .populate('student', 'name email studentId')
      .sort('submittedAt');

    // Build full list (submitted + not submitted)
    const submittedIds = submissions.map(s => s.student._id.toString());
    const notSubmitted = classroom.students.filter(s => !submittedIds.includes(s._id.toString()));

    res.json({ success: true, submissions, notSubmitted, totalStudents: classroom.students.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/assignments/:id/submit - Student submits assignment
router.post('/:id/submit', protect, restrictTo('student'), upload.array('files', 5), async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });

    // Check student is enrolled
    const classroom = await Classroom.findById(assignment.classroom);
    if (!classroom.students.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not enrolled in this classroom.' });
    }

    const existing = await Submission.findOne({ assignment: req.params.id, student: req.user._id });
    if (existing) return res.status(409).json({ success: false, message: 'Already submitted. You can only submit once.' });

    const now = new Date();
    const isLate = now > assignment.deadline;

    // Process files
    const files = (req.files || []).map(file => ({
      filename: `${Date.now()}_${file.originalname}`,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      data: file.buffer.toString('base64')
    }));

    const { notes } = req.body;

    const submission = await Submission.create({
      assignment: req.params.id,
      student: req.user._id,
      classroom: assignment.classroom,
      files,
      notes: notes || '',
      isLate,
      submittedAt: now
    });

    // Notify professor
    await Notification.create({
      user: assignment.professor,
      title: 'New Submission',
      message: `${req.user.name} submitted "${assignment.title}"${isLate ? ' (LATE)' : ''}.`,
      type: 'assignment',
      relatedId: assignment._id
    });

    res.status(201).json({ success: true, message: isLate ? 'Submitted (late).' : 'Submitted successfully!', submission: { ...submission.toObject(), files: files.map(f => ({ ...f, data: undefined })) } });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'Already submitted.' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/assignments/:assignmentId/grade/:submissionId - Grade submission
router.patch('/:assignmentId/grade/:submissionId', protect, restrictTo('professor', 'admin'), async (req, res) => {
  try {
    const { marksObtained, feedback } = req.body;
    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });

    if (marksObtained === undefined || marksObtained === null) {
      return res.status(400).json({ success: false, message: 'Marks are required.' });
    }
    if (Number(marksObtained) < 0 || Number(marksObtained) > assignment.totalMarks) {
      return res.status(400).json({ success: false, message: `Marks must be between 0 and ${assignment.totalMarks}.` });
    }

    const submission = await Submission.findByIdAndUpdate(
      req.params.submissionId,
      {
        marksObtained: Number(marksObtained),
        feedback: feedback || '',
        gradedAt: new Date(),
        gradedBy: req.user._id,
        status: 'graded'
      },
      { new: true }
    ).populate('student', 'name email');

    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found.' });

    // Notify student
    await Notification.create({
      user: submission.student._id,
      title: 'Assignment Graded',
      message: `Your submission for "${assignment.title}" has been graded: ${marksObtained}/${assignment.totalMarks}.`,
      type: 'grade',
      relatedId: assignment._id
    });

    res.json({ success: true, submission });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/assignments/student/marks - Student gets their marks
router.get('/me/marks', protect, restrictTo('student'), async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user._id, status: 'graded' })
      .populate({ path: 'assignment', select: 'title totalMarks classroom', populate: { path: 'classroom', select: 'name subject' } })
      .sort('-gradedAt');

    // Group by classroom
    const grouped = {};
    submissions.forEach(sub => {
      if (!sub.assignment) return;
      const classId = sub.assignment.classroom?._id?.toString();
      if (!classId) return;
      if (!grouped[classId]) {
        grouped[classId] = {
          classroom: sub.assignment.classroom,
          submissions: [],
          totalMarks: 0,
          obtainedMarks: 0
        };
      }
      grouped[classId].submissions.push(sub);
      grouped[classId].totalMarks += sub.assignment.totalMarks;
      grouped[classId].obtainedMarks += sub.marksObtained;
    });

    // Calculate averages
    Object.values(grouped).forEach(g => {
      g.percentage = g.totalMarks > 0 ? ((g.obtainedMarks / g.totalMarks) * 100).toFixed(1) : 0;
    });

    res.json({ success: true, grouped: Object.values(grouped), submissions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/assignments/submission/:submissionId/download/:fileIndex - Download file
router.get('/submission/:submissionId/file/:fileIndex', protect, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.submissionId);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found.' });
    const file = submission.files[parseInt(req.params.fileIndex)];
    if (!file) return res.status(404).json({ success: false, message: 'File not found.' });
    res.json({ success: true, file: { originalName: file.originalName, mimetype: file.mimetype, size: file.size, data: file.data } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

// GET /api/assignments/submission/:submissionId/files-list - List files without base64 data
router.get('/submission/:submissionId/files-list', protect, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.submissionId).populate('student', 'name');
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found.' });
    const files = submission.files.map((f, idx) => ({
      index: idx,
      originalName: f.originalName,
      filename: f.filename,
      mimetype: f.mimetype,
      size: f.size
    }));
    res.json({ success: true, files, student: submission.student });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
module.exports = router;
