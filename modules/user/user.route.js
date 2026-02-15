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
  googleCallback,
  authenticateUser,
  updatePassword,
  resendForgotPasswordOTP,
  deleteUser,
  getUserDevices,
  removeUserDevice,
  verifyRegisterOTP,
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

// Register a user
router.post("/registerUser", registerUser);
router.post("/verify-register-otp", verifyRegisterOTP);

// Log in a user
router.post("/login", loginUser);

// Google login route (redirect to Google)
router.get("/auth/google", googleLogin);

// Google callback route (after successful authentication)
router.get("/auth/google/callback", googleCallback);

// logout
router.get("/auth/google/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

// Forget password
router.post("/forget_pass", forgotPasswordOTPsend);
router.post("/resetPassOtpSend", resendForgotPasswordOTP);
router.post("/checkForgetPassOtp", verifyForgotPasswordOTP);
router.post("/resetPass", resetPassword);
router.post("/change-password", verifyUser("ANY"), changePassword);

// Update user image
router.put(
  "/update-user-details",
  verifyUser("ANY"),
  updateUserDetails,
);

router.put(
  "/update-image",
  upload.single("profilePicture"),
  verifyUser("ANY"),
  updateImage,
);

// Support
router.post("/sende-mail", verifyUser("ANY"), sendMailToAdmin);

//get me
router.get("/get-me", authenticateUser, getMe);
//update pass;
router.put("/updatePass", authenticateUser, updatePassword);
router.delete("/delete", authenticateUser, deleteUser);

router.get("/device", authenticateUser, getUserDevices);
router.delete("/device/:deviceId", authenticateUser, removeUserDevice);

export default router;
