export const createAttendanceSession = async (req, res) => {
  try {
    const { assignment_id, date, start_time, end_time, topic, method } = req.body;
    const assignment = await CourseAssignment.findById(assignment_id).populate("course lecturer semester");

    if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });

    // 🔒 ensure lecturer owns this assignment
    if (assignment.lecturer._id.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: "Unauthorized" });

    const existing = await AttendanceSession.findOne({
      assignment: assignment_id,
      session_date: date,
      start_time,
    });

    if (existing)
      return res.status(400).json({ success: false, message: "Session already exists for this time" });

    const session = await AttendanceSession.create({
      assignment: assignment_id,
      course: assignment.course._id,
      lecturer: assignment.lecturer._id,
      semester: assignment.semester._id,
      session_date: date,
      start_time,
      end_time,
      topic,
      attendance_method: method,
    });

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const markAttendance = async (req, res) => {
  try {
    const { session_id, student_id, method } = req.body;
    const session = await AttendanceSession.findById(session_id);
    if (!session || !session.is_active)
      return res.status(404).json({ success: false, message: "Invalid or closed session" });

    // Check if already marked
    const existing = await AttendanceRecord.findOne({ session: session_id, student: student_id });
    if (existing) return res.status(400).json({ success: false, message: "Already marked" });

    await AttendanceRecord.create({
      session: session_id,
      student: student_id,
      status: "present",
      check_in_time: new Date(),
      check_in_method: method,
    });

    await AttendanceSession.findByIdAndUpdate(session_id, {
      $inc: { present_count: 1 },
    });

    res.json({ success: true, message: "Attendance marked successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getAttendanceReport = async (req, res) => {
  try {
    const { assignment_id } = req.params;

    const sessions = await AttendanceSession.find({ assignment: assignment_id })
      .populate("course lecturer")
      .lean();

    for (const s of sessions) {
      s.records = await AttendanceRecord.find({ session: s._id })
        .populate("student", "matric_number full_name")
        .lean();
    }

    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
