// routes/admin.js

const express = require('express');
const router = express.Router();
const { User, Classroom, Assignment, Submission, Notification } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');

// All routes require admin
router.use(protect, restrictTo('admin'));

// GET /api/admin/dashboard - Overview stats
router.get('/dashboard', async (req, res) => {
  try {
    const [totalUsers, totalProfessors, totalStudents, totalClassrooms, totalAssignments, totalSubmissions, gradedSubmissions] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'professor', isActive: true }),
      User.countDocuments({ role: 'student', isActive: true }),
      Classroom.countDocuments({ isActive: true }),
      Assignment.countDocuments(),
      Submission.countDocuments(),
      Submission.countDocuments({ status: 'graded' })
    ]);

    // Recent activity
    const recentSubmissions = await Submission.find()
      .sort('-submittedAt').limit(10)
      .populate('student', 'name')
      .populate({ path: 'assignment', select: 'title', populate: { path: 'classroom', select: 'name' } });

    // Submission trend (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const submissionTrend = await Submission.aggregate([
      { $match: { submittedAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Avg marks per classroom
    const avgMarks = await Submission.aggregate([
      { $match: { status: 'graded' } },
      { $group: { _id: '$classroom', avgMarks: { $avg: '$marksObtained' }, count: { $sum: 1 } } },
      { $lookup: { from: 'classrooms', localField: '_id', foreignField: '_id', as: 'classroom' } },
      { $unwind: '$classroom' },
      { $project: { classroomName: '$classroom.name', subject: '$classroom.subject', avgMarks: { $round: ['$avgMarks', 1] }, count: 1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      stats: { totalUsers, totalProfessors, totalStudents, totalClassrooms, totalAssignments, totalSubmissions, gradedSubmissions, pendingGrading: totalSubmissions - gradedSubmissions },
      recentSubmissions,
      submissionTrend,
      avgMarks
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/users - All users
router.get('/users', async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (role) query.role = role;
    if (search) query.$or = [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
    const users = await User.find(query).select('-password').sort('-createdAt')
      .limit(Number(limit)).skip((Number(page) - 1) * Number(limit));
    const total = await User.countDocuments(query);
    res.json({ success: true, users, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/users/:id/toggle - Toggle user active status
router.patch('/users/:id/toggle', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot deactivate admin.' });
    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: `User ${user.isActive ? 'activated' : 'deactivated'}.`, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot delete admin.' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/classrooms - All classrooms with full details
router.get('/classrooms', async (req, res) => {
  try {
    const classrooms = await Classroom.find()
      .populate('professor', 'name email')
      .populate('students', 'name email studentId')
      .sort('-createdAt');
    res.json({ success: true, classrooms });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/classrooms/:id/analytics
router.get('/classrooms/:id/analytics', async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id)
      .populate('professor', 'name email')
      .populate('students', 'name email studentId');
    if (!classroom) return res.status(404).json({ success: false, message: 'Classroom not found.' });

    const assignments = await Assignment.find({ classroom: req.params.id });
    const submissions = await Submission.find({ classroom: req.params.id })
      .populate('student', 'name email studentId')
      .populate('assignment', 'title totalMarks deadline');

    // Per-assignment analytics
    const assignmentAnalytics = await Promise.all(assignments.map(async (a) => {
      const subs = submissions.filter(s => s.assignment?._id?.toString() === a._id.toString());
      const graded = subs.filter(s => s.status === 'graded');
      const avgMarks = graded.length ? (graded.reduce((acc, s) => acc + s.marksObtained, 0) / graded.length).toFixed(1) : null;
      return {
        assignment: a,
        totalStudents: classroom.students.length,
        submitted: subs.length,
        graded: graded.length,
        lateSubmissions: subs.filter(s => s.isLate).length,
        avgMarks,
        submissionRate: classroom.students.length ? ((subs.length / classroom.students.length) * 100).toFixed(0) : 0
      };
    }));

    // Per-student analytics
    const studentAnalytics = classroom.students.map(student => {
      const studentSubs = submissions.filter(s => s.student?._id?.toString() === student._id.toString());
      const graded = studentSubs.filter(s => s.status === 'graded');
      const totalObtained = graded.reduce((acc, s) => acc + s.marksObtained, 0);
      const totalPossible = graded.reduce((acc, s) => acc + (s.assignment?.totalMarks || 0), 0);
      return {
        student,
        submissionCount: studentSubs.length,
        gradedCount: graded.length,
        totalObtained,
        totalPossible,
        percentage: totalPossible > 0 ? ((totalObtained / totalPossible) * 100).toFixed(1) : null,
        lateSubmissions: studentSubs.filter(s => s.isLate).length
      };
    });

    res.json({ success: true, classroom, assignmentAnalytics, studentAnalytics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/submissions - All submissions
router.get('/submissions', async (req, res) => {
  try {
    const submissions = await Submission.find()
      .populate('student', 'name email studentId')
      .populate({ path: 'assignment', select: 'title totalMarks deadline', populate: { path: 'classroom', select: 'name subject' } })
      .sort('-submittedAt')
      .limit(100);
    res.json({ success: true, submissions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
