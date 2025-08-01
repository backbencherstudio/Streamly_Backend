import express from 'express';
import {
  // registerUserStep1,
  // verifyOTP,
  // registerUserStep3,
  registerUser,
  loginUser,
  forgotPasswordOTPsend,
  resetPassword,
  verifyForgotPasswordOTP,
  updateImage,
  updateUserDetails,
  changePassword,
  sendMailToAdmin,
  getMe
} from './user.controller.js';
import { upload } from '../../config/Multer.config.js';
import { verifyUser } from '../../middlewares/verifyUsers.js';


const router = express.Router();
// Test route
router.get('/test', (req, res) => {
  res.send('User route connected');
});

// File upload route
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }
  res.status(200).send({ message: 'File uploaded successfully', file: req.file });
});
//Register a user
router.post('/registerUser', registerUser);
// router.post('/verify-otp', verifyOTP);
// router.post('/register-step3', registerUserStep3);
//log iin a user
router.post('/login', loginUser);
//forget pass
router.post('/forget_pass', forgotPasswordOTPsend);
router.post('/checkForgetPassOtp', verifyForgotPasswordOTP);
router.post('/resetPass', resetPassword);
router.post('/change-password', verifyUser("USER"), changePassword);
//update user img
router.put('/update-image', upload.single('profilePicture'), verifyUser("USER"), updateImage);
router.put('/update-user-details', verifyUser("USER"), updateUserDetails);
//support
router.post('/sende-mail', verifyUser("USER"), sendMailToAdmin)
//get me 
router.get('/get-me', verifyUser("USER"), getMe);
export default router;
