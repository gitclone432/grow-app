import mongoose from 'mongoose';

// Nomenclature note:
// Model name `Attendance` is legacy; stored data represents WORKING HOURS sessions.
// Keep this name to avoid breaking existing references and production data compatibility.

const AttendanceSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, index: true }, // YYYY-MM-DD format
        sessions: [
            {
                startTime: { type: Date, required: true },
                endTime: { type: Date } // null if session is still active
            }
        ],
        status: {
            type: String,
            enum: ['active', 'paused', 'completed'],
            required: true,
            default: 'active'
        },
        currentSessionStart: { type: Date }, // Track when current session started
        totalWorkTime: { type: Number, default: 0 } // Total milliseconds worked
    },
    { timestamps: true }
);

// Compound index for efficient querying
AttendanceSchema.index({ user: 1, date: 1 });

// Method to calculate total work time from sessions
AttendanceSchema.methods.calculateTotalWorkTime = function () {
    let total = 0;
    for (const session of this.sessions) {
        if (session.endTime) {
            total += session.endTime - session.startTime;
        } else if (this.currentSessionStart) {
            // If session is still active, calculate up to now
            total += Date.now() - session.startTime;
        }
    }
    this.totalWorkTime = total;
    return total;
};

export default mongoose.model('Attendance', AttendanceSchema);
