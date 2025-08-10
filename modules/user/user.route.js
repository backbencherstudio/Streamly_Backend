import express from "express";
import {
  registerUser,
  loginUser,
  forgotPasswordOTPsend,
  resetPassword,
  verifyForgotPasswordOTP,
  updateImage,
  updateUserDetails,
  changePassword,
  sendMailToAdmin,
  getMe,
  googleLogin,
} from "./user.controller.js";
import { upload } from "../../config/Multer.config.js";
import { verifyUser } from "../../middlewares/verifyUsers.js";

const router = express.Router();
// Test route
router.get("/test", (req, res) => {
  res.send("User route connected");
});

// File upload route
router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }
  res
    .status(200)
    .send({ message: "File uploaded successfully", file: req.file });
});

//Register a user
router.post("/registerUser", registerUser);
//log in a user
router.post("/login", loginUser);

// Google login
router.patch("/google-login", googleLogin);

//forget pass
router.post("/forget_pass", forgotPasswordOTPsend);
router.post("/checkForgetPassOtp", verifyForgotPasswordOTP);
router.post("/resetPass", resetPassword);
router.post("/change-password", verifyUser("USER"), changePassword);

//update user img
router.put('/update-image', upload.single('profilePicture'), verifyUser("normal"), updateImage);
router.put('/update-user-details', verifyUser("normal"), updateUserDetails);



//support
router.post('/sende-mail', verifyUser("USER"), sendMailToAdmin)


//get me 
router.get('/get-me', verifyUser("normal"), getMe);
export default router;
