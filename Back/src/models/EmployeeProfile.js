import mongoose from 'mongoose';

const EmployeeProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    name: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    dateOfBirth: { type: Date },
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], trim: true },
    dateOfJoining: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'], trim: true },
    address: { type: String, trim: true },
    email: { type: String, trim: true },
    bankAccountNumber: { type: String, trim: true },
    bankIFSC: { type: String, trim: true },
    bankName: { type: String, trim: true },
    workingMode: { type: String, enum: ['remote', 'office', 'hybrid'], trim: true },
    workingHours: { type: String, trim: true },
    aadharNumber: { type: String, trim: true },
    panNumber: { type: String, trim: true },

    // Task Management Fields
    myTaskList: { type: String, trim: true },
    primaryTask: { type: String, trim: true, default: 'Number of listings per day : ?' },
    secondaryTask: { type: String, trim: true },

    // Visibility Control
    isHidden: { type: Boolean, default: false },

    // NEW: BLOB storage for files (images and PDFs)
    profilePic: {
      data: Buffer,
      contentType: String,
      fileName: String,
      uploadedAt: Date
    },
    aadharDocument: {
      data: Buffer,
      contentType: String,
      fileName: String,
      uploadedAt: Date
    },
    panDocument: {
      data: Buffer,
      contentType: String,
      fileName: String,
      uploadedAt: Date
    },

    // OLD: Keep for backward compatibility during migration (will be removed later)
    profilePicUrl: { type: String },
    aadharImageUrl: { type: String },
    panImageUrl: { type: String }
  },
  { timestamps: true }
);

export default mongoose.model('EmployeeProfile', EmployeeProfileSchema);
