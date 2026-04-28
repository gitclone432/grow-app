import { Router } from 'express';
import { requireAuth, requireAuthFile } from '../middleware/auth.js';
import EmployeeProfile from '../models/EmployeeProfile.js';
import User from '../models/User.js';
import Seller from '../models/Seller.js';
import UserSellerAssignment from '../models/UserSellerAssignment.js';
import multer from 'multer';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/jpg', 'image/png',
      'application/pdf'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and PDF allowed.'));
    }
  }
});

function pickProfile(body) {
  const allowed = [
    'name',
    'phoneNumber',
    'dateOfBirth',
    'bloodGroup',
    'dateOfJoining',
    'gender',
    'address',
    'email',
    'bankAccountNumber',
    'bankIFSC',
    'bankName',
    'aadharNumber',
    'panNumber',
    'profilePicUrl',
    'aadharImageUrl',
    'panImageUrl',
    'myTaskList',
    'primaryTask',
    'secondaryTask'
  ];
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

// GET /api/employee-profiles/me - fetch my profile (create if not exists)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id || req.user.id;
    let profile = await EmployeeProfile.findOne({ user: userId });
    if (!profile) {
      profile = await EmployeeProfile.create({ user: userId });
    }

    // Convert to object and exclude binary data
    const profileObj = profile.toObject();

    // Add boolean flags for file existence
    profileObj.hasProfilePic = !!(profile.profilePic && profile.profilePic.data);
    profileObj.hasAadhar = !!(profile.aadharDocument && profile.aadharDocument.data);
    profileObj.hasPan = !!(profile.panDocument && profile.panDocument.data);

    // Remove binary data from response (too heavy)
    delete profileObj.profilePic;
    delete profileObj.aadharDocument;
    delete profileObj.panDocument;

    res.json(profileObj);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile', details: err.message });
  }
});

// PUT /api/employee-profiles/me - upsert my profile
router.put('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id || req.user.id;
    const data = pickProfile(req.body || {});
    const profile = await EmployeeProfile.findOneAndUpdate(
      { user: userId },
      { $set: data, $setOnInsert: { user: userId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile', details: err.message });
  }
});

// GET /api/employee-profiles - list all (superadmin, hradmin, operationhead)
router.get('/', requireAuth, async (req, res) => {
  try {
    if (!['superadmin', 'hradmin', 'operationhead'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const list = await EmployeeProfile.find({}).populate('user', 'username role email department isStrictTimer');

    // Filter out superadmin accounts and map profiles to exclude binary data and add file flags
    const profiles = list
      .filter(profile => profile.user && profile.user.role !== 'superadmin')
      .map(profile => {
        const profileObj = profile.toObject();

        // Add boolean flags for file existence
        profileObj.hasProfilePic = !!(profile.profilePic && profile.profilePic.data);
        profileObj.hasAadhar = !!(profile.aadharDocument && profile.aadharDocument.data);
        profileObj.hasPan = !!(profile.panDocument && profile.panDocument.data);

        // Remove binary data
        delete profileObj.profilePic;
        delete profileObj.aadharDocument;
        delete profileObj.panDocument;

        return profileObj;
      });

    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list profiles', details: err.message });
  }
});

// PUT /api/employee-profiles/:id - update user and profile fields (superadmin, hradmin, operationhead)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    if (!['superadmin', 'hradmin', 'operationhead'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const profile = await EmployeeProfile.findById(req.params.id).populate('user');
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Extract profile fields using the helper
    const profileData = pickProfile(req.body);

    // Remove empty string values for enum fields to avoid validation errors
    if (profileData.gender === '') delete profileData.gender;

    // Extract admin fields (only if non-empty)
    const { workingMode, workingHours } = req.body;
    if (workingMode && workingMode !== '') profileData.workingMode = workingMode;
    if (workingHours && workingHours !== '') profileData.workingHours = workingHours;

    // Update EmployeeProfile
    Object.assign(profile, profileData);
    await profile.save();

    // Update User fields (role, department)
    const { role, department } = req.body;
    if (role !== undefined) profile.user.role = role;
    if (department !== undefined) profile.user.department = department;

    await profile.user.save();

    // Re-populate and return
    await profile.populate('user', 'username role email department');
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile', details: err.message });
  }
});

// PUT /api/employee-profiles/:id/admin-fields - update workingMode and workingHours (superadmin, hradmin, operationhead only)
router.put('/:id/admin-fields', requireAuth, async (req, res) => {
  try {
    if (!['superadmin', 'hradmin', 'operationhead'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { workingMode, workingHours } = req.body;
    const update = {};
    if (workingMode !== undefined) update.workingMode = workingMode;
    if (workingHours !== undefined) update.workingHours = workingHours;

    const profile = await EmployeeProfile.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    ).populate('user', 'username role email department');

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update admin fields', details: err.message });
  }
});

// ===== FILE UPLOAD ENDPOINTS =====

// POST /api/employee-profiles/me/upload/profile-pic - Upload profile picture
router.post('/me/upload/profile-pic', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.userId || req.user._id || req.user.id;
    const profile = await EmployeeProfile.findOne({ user: userId });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Use findByIdAndUpdate to avoid validation of other fields
    await EmployeeProfile.findByIdAndUpdate(
      profile._id,
      {
        $set: {
          profilePic: {
            data: req.file.buffer,
            contentType: req.file.mimetype,
            fileName: req.file.originalname,
            uploadedAt: new Date()
          }
        }
      },
      { runValidators: false }
    );

    res.json({ message: 'Profile picture uploaded successfully', hasProfilePic: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload profile picture', details: err.message });
  }
});

// POST /api/employee-profiles/me/upload/aadhar - Upload Aadhaar document
router.post('/me/upload/aadhar', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.userId || req.user._id || req.user.id;
    const profile = await EmployeeProfile.findOne({ user: userId });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Use findByIdAndUpdate to only update the document field, avoiding validation of other fields
    await EmployeeProfile.findByIdAndUpdate(
      profile._id,
      {
        $set: {
          aadharDocument: {
            data: req.file.buffer,
            contentType: req.file.mimetype,
            fileName: req.file.originalname,
            uploadedAt: new Date()
          }
        }
      },
      { runValidators: false }
    );

    res.json({ message: 'Aadhaar document uploaded successfully', hasAadhar: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload Aadhaar document', details: err.message });
  }
});

// POST /api/employee-profiles/me/upload/pan - Upload PAN document
router.post('/me/upload/pan', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.userId || req.user._id || req.user.id;
    const profile = await EmployeeProfile.findOne({ user: userId });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Use findByIdAndUpdate to avoid validation of other fields
    await EmployeeProfile.findByIdAndUpdate(
      profile._id,
      {
        $set: {
          panDocument: {
            data: req.file.buffer,
            contentType: req.file.mimetype,
            fileName: req.file.originalname,
            uploadedAt: new Date()
          }
        }
      },
      { runValidators: false }
    );

    res.json({ message: 'PAN document uploaded successfully', hasPan: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload PAN document', details: err.message });
  }
});

// ===== FILE RETRIEVAL ENDPOINTS =====

// GET /api/employee-profiles/me/file/profile-pic - Get my profile picture
router.get('/me/file/profile-pic', requireAuthFile, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id || req.user.id;
    const profile = await EmployeeProfile.findOne({ user: userId });

    if (!profile || !profile.profilePic || !profile.profilePic.data) {
      return res.status(404).json({ error: 'Profile picture not found' });
    }

    // Set CORS headers for cross-origin image loading
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Content-Type', profile.profilePic.contentType);
    res.set('Content-Disposition', `inline; filename="${profile.profilePic.fileName}"`);
    res.set('Cache-Control', 'public, max-age=3600');

    res.send(profile.profilePic.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve profile picture', details: err.message });
  }
});

// GET /api/employee-profiles/me/file/aadhar - Get my Aadhaar document
router.get('/me/file/aadhar', requireAuthFile, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id || req.user.id;
    const profile = await EmployeeProfile.findOne({ user: userId });

    if (!profile || !profile.aadharDocument || !profile.aadharDocument.data) {
      return res.status(404).json({ error: 'Aadhaar document not found' });
    }

    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Content-Type', profile.aadharDocument.contentType);
    res.set('Content-Disposition', `inline; filename="${profile.aadharDocument.fileName}"`);
    res.send(profile.aadharDocument.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve Aadhaar document', details: err.message });
  }
});

// GET /api/employee-profiles/me/file/pan - Get my PAN document
router.get('/me/file/pan', requireAuthFile, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id || req.user.id;
    const profile = await EmployeeProfile.findOne({ user: userId });

    if (!profile || !profile.panDocument || !profile.panDocument.data) {
      return res.status(404).json({ error: 'PAN document not found' });
    }

    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Content-Type', profile.panDocument.contentType);
    res.set('Content-Disposition', `inline; filename="${profile.panDocument.fileName}"`);
    res.send(profile.panDocument.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve PAN document', details: err.message });
  }
});

// GET /api/employee-profiles/:id/file/profile-pic - Get employee's profile picture (admin access)
router.get('/:id/file/profile-pic', requireAuthFile, async (req, res) => {
  try {
    if (!['superadmin', 'hradmin', 'operationhead'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const profile = await EmployeeProfile.findById(req.params.id);

    if (!profile || !profile.profilePic || !profile.profilePic.data) {
      return res.status(404).json({ error: 'Profile picture not found' });
    }

    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Content-Type', profile.profilePic.contentType);
    res.set('Content-Disposition', `inline; filename="${profile.profilePic.fileName}"`);
    res.send(profile.profilePic.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve profile picture', details: err.message });
  }
});

// GET /api/employee-profiles/:id/file/aadhar - Get employee's Aadhaar document (admin access)
router.get('/:id/file/aadhar', requireAuthFile, async (req, res) => {
  try {
    if (!['superadmin', 'hradmin', 'operationhead'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const profile = await EmployeeProfile.findById(req.params.id);

    if (!profile || !profile.aadharDocument || !profile.aadharDocument.data) {
      return res.status(404).json({ error: 'Aadhaar document not found' });
    }

    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Content-Type', profile.aadharDocument.contentType);
    res.set('Content-Disposition', `inline; filename="${profile.aadharDocument.fileName}"`);
    res.send(profile.aadharDocument.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve Aadhaar document', details: err.message });
  }
});

// GET /api/employee-profiles/:id/file/pan - Get employee's PAN document (admin access)
router.get('/:id/file/pan', requireAuthFile, async (req, res) => {
  try {
    if (!['superadmin', 'hradmin', 'operationhead'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const profile = await EmployeeProfile.findById(req.params.id);

    if (!profile || !profile.panDocument || !profile.panDocument.data) {
      return res.status(404).json({ error: 'PAN document not found' });
    }

    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Content-Type', profile.panDocument.contentType);
    res.set('Content-Disposition', `inline; filename="${profile.panDocument.fileName}"`);
    res.send(profile.panDocument.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve PAN document', details: err.message });
  }
});

// PATCH /api/employee-profiles/:id/toggle-hidden - Toggle hidden status (superadmin, hradmin only)
router.patch('/:id/toggle-hidden', requireAuth, async (req, res) => {
  try {
    // Only superadmin and hradmin can hide/unhide profiles
    if (!['superadmin', 'hradmin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Only superadmin and hradmin can hide/unhide profiles' });
    }

    const profile = await EmployeeProfile.findById(req.params.id).populate('user', 'username role email department');

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Toggle the isHidden field
    profile.isHidden = !profile.isHidden;
    await profile.save();

    // Convert to object and exclude binary data
    const profileObj = profile.toObject();

    // Add boolean flags for file existence
    profileObj.hasProfilePic = !!(profile.profilePic && profile.profilePic.data);
    profileObj.hasAadhar = !!(profile.aadharDocument && profile.aadharDocument.data);
    profileObj.hasPan = !!(profile.panDocument && profile.panDocument.data);

    // Remove binary data
    delete profileObj.profilePic;
    delete profileObj.aadharDocument;
    delete profileObj.panDocument;

    res.json({
      message: `Profile ${profile.isHidden ? 'hidden' : 'unhidden'} successfully`,
      profile: profileObj
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle hidden status', details: err.message });
  }
});

// DELETE /api/employee-profiles/:id - Archive seller users; hard-delete non-seller users (admin only)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (!['superadmin', 'hradmin', 'operationhead'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const profile = await EmployeeProfile.findById(req.params.id).populate('user');

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Store user info before deletion
    const userId = profile.user?._id;
    const username = profile.user?.username || 'Unknown';

    // Delete the employee profile
    await EmployeeProfile.findByIdAndDelete(req.params.id);

    // Handle associated user account if it exists
    if (userId) {
      const seller = await Seller.findOne({ user: userId }).select('_id').lean();
      if (seller?._id) {
        // Seller path: keep seller/user records for reconnect, but archive + disconnect store.
        await UserSellerAssignment.deleteMany({ seller: seller._id });
        await Seller.findByIdAndUpdate(seller._id, {
          $set: {
            isStoreActive: false,
            disconnectedAt: new Date(),
            ebayTokens: {}
          }
        });
        await User.findByIdAndUpdate(userId, { $set: { active: false } });
      } else {
        // Non-seller path: preserve previous hard-delete behavior.
        await User.findByIdAndDelete(userId);
      }
    }

    res.json({
      message: 'Employee removed. Seller accounts are archived for reconnect; non-seller users are permanently deleted.',
      deletedProfile: req.params.id,
      deletedUser: userId,
      username
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete employee', details: err.message });
  }
});

export default router;
