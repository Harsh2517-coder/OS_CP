// routes/classrooms.js

const express = require('express');
const router = express.Router();
const { Classroom, User, Assignment, Submission, Notification } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');

// Generate unique 6-char class code
const generateClassCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const COVER_COLORS = ['#4F46E5','#0891B2','#059669','#DC2626','#D97706','#7C3AED','#DB2777','#0284C7'];

// GET /api/classrooms - Get classrooms (filtered by role)
router.get('/', protect, async (req, res) => {
  try {
    let classrooms;
    if (req.user.role === 'admin') {
      classrooms = await Classroom.find({ isActive: true })
        .populate('professor', 'name email')
        .populate('students', 'name email studentId')
        .sort('-createdAt');
    } else if (req.user.role === 'professor') {
      classrooms = await Classroom.find({ professor: req.user._id, isActive: true })
        .populate('students', 'name email studentId')
        .sort('-createdAt');
    } else {
      classrooms = await Classroom.find({ students: req.user._id, isActive: true })
        .populate('professor', 'name email')
        .sort('-createdAt');
    }
    res.json({ success: true, classrooms });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/classrooms - Create classroom (professor only)
router.post('/', protect, restrictTo('professor'), async (req, res) => {
  try {
    const { name, subject, description, semester, academicYear } = req.body;
    if (!name || !subject) return res.status(400).json({ success: false, message: 'Name and subject are required.' });

    let classCode, exists = true;
    while (exists) {
      classCode = generateClassCode();
      exists = await Classroom.findOne({ classCode });
    }

    const coverColor = COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
    const classroom = await Classroom.create({
      name, subject, description, semester, academicYear,
      professor: req.user._id, classCode, coverColor
    });

    const populated = await classroom.populate('professor', 'name email');
    res.status(201).json({ success: true, classroom: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/classrooms/:id - Get single classroom
router.get('/:id', protect, async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id)
      .populate('professor', 'name email department')
      .populate('students', 'name email studentId department');
    if (!classroom || !classroom.isActive) return res.status(404).json({ success: false, message: 'Classroom not found.' });

    // Access check
    if (req.user.role === 'professor' && classroom.professor._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (req.user.role === 'student' && !classroom.students.some(s => s._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ success: false, message: 'Not enrolled in this classroom.' });
    }

    res.json({ success: true, classroom });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/classrooms/:id - Update classroom
router.patch('/:id', protect, restrictTo('professor'), async (req, res) => {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.id, professor: req.user._id });
    if (!classroom) return res.status(404).json({ success: false, message: 'Classroom not found.' });
    const { name, subject, description, semester, academicYear } = req.body;
    if (name) classroom.name = name;
    if (subject) classroom.subject = subject;
    if (description !== undefined) classroom.description = description;
    if (semester) classroom.semester = semester;
    if (academicYear) classroom.academicYear = academicYear;
    await classroom.save();
    res.json({ success: true, classroom });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/classrooms/:id - Delete classroom
router.delete('/:id', protect, restrictTo('professor', 'admin'), async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, professor: req.user._id };
    const classroom = await Classroom.findOne(query);
    if (!classroom) return res.status(404).json({ success: false, message: 'Classroom not found.' });
    classroom.isActive = false;
    await classroom.save();
    res.json({ success: true, message: 'Classroom deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/classrooms/join - Student joins via class code
router.post('/join/with-code', protect, restrictTo('student'), async (req, res) => {
  try {
    const { classCode } = req.body;
    if (!classCode) return res.status(400).json({ success: false, message: 'Class code is required.' });

    const classroom = await Classroom.findOne({ classCode: classCode.toUpperCase(), isActive: true });
    if (!classroom) return res.status(404).json({ success: false, message: 'Invalid class code.' });

    if (classroom.students.includes(req.user._id)) {
      return res.status(409).json({ success: false, message: 'Already enrolled in this classroom.' });
    }

    classroom.students.push(req.user._id);
    await classroom.save();

    await User.findByIdAndUpdate(req.user._id, { $addToSet: { enrolledClassrooms: classroom._id } });

    // Notify professor
    await Notification.create({
      user: classroom.professor,
      title: 'New Student Joined',
      message: `${req.user.name} joined your classroom "${classroom.name}".`,
      type: 'classroom',
      relatedId: classroom._id
    });

    const populated = await classroom.populate([
      { path: 'professor', select: 'name email' },
      { path: 'students', select: 'name email studentId' }
    ]);

    res.json({ success: true, message: `Joined "${classroom.name}" successfully!`, classroom: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/classrooms/:id/remove-student/:studentId
router.delete('/:id/remove-student/:studentId', protect, restrictTo('professor', 'admin'), async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) return res.status(404).json({ success: false, message: 'Classroom not found.' });
    classroom.students = classroom.students.filter(s => s.toString() !== req.params.studentId);
    await classroom.save();
    res.json({ success: true, message: 'Student removed.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
